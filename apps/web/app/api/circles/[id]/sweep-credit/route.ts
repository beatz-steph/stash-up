import { randomUUID } from "node:crypto";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma, Prisma } from "@workspace/db";
import { requireCircleMember } from "@/lib/access-control";
import { creditWallet } from "@/lib/wallet/ledger";
import type { SweepCreditRes } from "./dto/sweep-credit.dto";

/**
 * Move the member's leftover circle credit (bufferMinor) into their wallet.
 * The completion auto-sweep (advanceRotation) handles the normal case; this
 * covers the rare tail where a payment settles AFTER the circle finished, so
 * the buffer accrued with no future cycle to auto-apply it to.
 *
 * Only allowed on a finished circle (COMPLETED/CANCELLED) — on an ACTIVE circle
 * the buffer auto-applies to the next cycle, so we must not fight that.
 *
 * Race-safe: a single conditional UPDATE claims + zeros the buffer under a row
 * lock, returning the amount claimed; only the winning request credits. The
 * whole thing runs in one $transaction so a credit failure un-zeros the buffer.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return apiError("Unauthorized", 401);

  const { id: circleId } = await params;
  const userId = session.user.id;

  let membership;
  try {
    membership = await requireCircleMember(circleId, userId);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Forbidden", 403);
  }

  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    select: { status: true },
  });
  if (!circle) return apiError("Circle not found", 404);
  if (circle.status === "ACTIVE" || circle.status === "FORMING") {
    return apiError(
      "Credit only moves to your wallet once the circle finishes — while it's active it applies to your next cycle automatically.",
      409
    );
  }

  if ((membership.bufferMinor ?? 0) <= 0) {
    return apiError("You have no leftover credit on this circle", 400);
  }

  const nonce = randomUUID();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Atomically claim + zero the buffer under a row lock. Empty result = a
    // concurrent sweep already took it (buffer is now 0).
    const claimed = await tx.$queryRaw<{ bufferMinor: number }[]>`
      WITH claimed AS (
        SELECT "id", "bufferMinor" FROM "Membership"
        WHERE "id" = ${membership.id} AND "bufferMinor" > 0
        FOR UPDATE
      )
      UPDATE "Membership" m SET "bufferMinor" = 0
      FROM claimed WHERE m."id" = claimed."id"
      RETURNING claimed."bufferMinor" AS "bufferMinor"`;

    const amountMinor = Number(claimed[0]?.bufferMinor ?? 0);
    if (amountMinor <= 0) {
      return { creditedMinor: 0, balanceAfterMinor: null as number | null };
    }

    const res = await creditWallet(tx, {
      userId,
      amountMinor,
      source: "BUFFER_SWEEP",
      reference: circleId,
      idempotencyKey: `manualbuffer_${membership.id}_${nonce}`,
    });

    return { creditedMinor: amountMinor, balanceAfterMinor: res.balanceAfterMinor };
  });

  if (result.creditedMinor <= 0) {
    return apiError("You have no leftover credit on this circle", 400);
  }

  return apiSuccess<SweepCreditRes>({
    creditedMinor: result.creditedMinor,
    balanceAfterMinor: result.balanceAfterMinor ?? 0,
  });
}
