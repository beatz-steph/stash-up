import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import { requireCircleCreator } from "@/lib/access-control";
import { acquireActivationLock, releaseActivationLock } from "@/lib/redis";
import { createVirtualAccount } from "@/lib/nomba-client";
import { finalizeActivationIfReady } from "@/lib/circles/activation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    await requireCircleCreator(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  const circle = await prisma.circle.findUnique({
    where: { id },
    include: { memberships: true },
  });

  if (!circle) {
    return apiError("Circle not found", 404);
  }

  if (circle.status !== "FORMING") {
    return apiError("Circle is not forming", 400);
  }

  const activeMemberships = circle.memberships.filter((m) => m.status === "ACTIVE");
  if (activeMemberships.length !== circle.totalSlots) {
    return apiError("Circle slots are not full", 400);
  }

  const lockAcquired = await acquireActivationLock(id);
  if (!lockAcquired) {
    return apiError("Activation already in progress", 409);
  }

  try {
    // Provision VAs sequentially outside transaction
    for (const membership of activeMemberships) {
      if (membership.vaProvisionStatus === "PROVISIONED") continue;

      try {
        // Fetch user details for VA name
        const user = await prisma.user.findUnique({ where: { id: membership.userId } });
        if (!user) continue;

        const accountRef = `membership_${membership.id}`;
        const vaRes = await createVirtualAccount({
          accountRef,
          accountName: user.name ?? user.username ?? "StashUp Member",
        });

        await prisma.$transaction(async (tx) => {
          await tx.virtualAccount.upsert({
            where: { membershipId: membership.id },
            update: {
              provider: "NOMBA",
              accountRef: vaRes.accountRef,
              providerAccountRef: vaRes.accountRef, // mapped as fallback per instructions
              bankAccountNumber: vaRes.bankAccountNumber,
              bankAccountName: vaRes.bankAccountName,
              bankName: vaRes.bankName,
              bankCode: vaRes.bankCode,
              status: "ACTIVE",
            },
            create: {
              membershipId: membership.id,
              provider: "NOMBA",
              accountRef: vaRes.accountRef,
              providerAccountRef: vaRes.accountRef,
              bankAccountNumber: vaRes.bankAccountNumber,
              bankAccountName: vaRes.bankAccountName,
              bankName: vaRes.bankName,
              bankCode: vaRes.bankCode,
              status: "ACTIVE",
            },
          });

          await tx.membership.update({
            where: { id: membership.id },
            data: { vaProvisionStatus: "PROVISIONED" },
          });
        });
      } catch (err) {
        console.error(`Failed to provision VA for membership ${membership.id}:`, err);
        await prisma.membership.update({
          where: { id: membership.id },
          data: { vaProvisionStatus: "FAILED" },
        });
      }
    }

    const activated = await finalizeActivationIfReady(id);
    return apiSuccess({ activated });
  } finally {
    await releaseActivationLock(id);
  }
}
