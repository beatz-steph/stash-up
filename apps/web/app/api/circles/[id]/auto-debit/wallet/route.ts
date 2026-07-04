import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleMember, requireVerifiedEmail } from "@/lib/access-control";
import { shouldCollectNow, computeRemainingDue } from "@/lib/cards/enrollment";
import { collectFromWallet } from "@/lib/wallet/waterfall";
import {
  ToggleWalletAutoDebitReqSchema,
  type ToggleWalletAutoDebitRes,
} from "@/app/api/cards/dto/cards.dto";

/**
 * Opt this circle in/out of wallet auto-save. When turning it ON and the member
 * currently owes on an open cycle, we immediately pull from the wallet (the same
 * waterfall the sweep uses) so the effect is instant.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id: circleId } = await params;
  const userId = session.user.id;

  let membership;
  try {
    requireVerifiedEmail(session.user);
    membership = await requireCircleMember(circleId, userId);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = ToggleWalletAutoDebitReqSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("enabled flag is required", 422);
  }
  const { enabled } = parsed.data;

  await prisma.membership.update({
    where: { id: membership.id },
    data: { autoDebitWallet: enabled },
  });

  let collectedMinor = 0;
  if (enabled) {
    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      select: { contributionMinor: true, currentCycleSeq: true },
    });
    const cycle = circle
      ? await prisma.cycle.findUnique({
          where: { circleId_sequence: { circleId, sequence: circle.currentCycleSeq || 1 } },
          select: { id: true, status: true },
        })
      : null;

    if (circle && cycle) {
      const contribution = await prisma.contribution.findUnique({
        where: { cycleId_membershipId: { cycleId: cycle.id, membershipId: membership.id } },
        select: { amountMinor: true },
      });
      const remainingDue = computeRemainingDue(
        circle.contributionMinor,
        contribution?.amountMinor ?? 0
      );
      if (shouldCollectNow(cycle.status, remainingDue)) {
        try {
          const res = await collectFromWallet({
            userId,
            membershipId: membership.id,
            cycleId: cycle.id,
            contributionMinor: circle.contributionMinor,
          });
          collectedMinor = res.debitedMinor;
        } catch (err) {
          // Non-fatal — the toggle still took; the sweep will collect later.
          console.error(
            "[auto-debit/wallet] immediate collect failed:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  return apiSuccess<ToggleWalletAutoDebitRes>({ autoDebitWallet: enabled, collectedMinor });
}
