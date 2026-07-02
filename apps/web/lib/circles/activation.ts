import { prisma } from "@workspace/db";
import type { Frequency } from "@workspace/db";

export function calculateDeadline(frequency: Frequency): Date {
  const deadline = new Date();
  if (frequency === "WEEKLY") {
    deadline.setDate(deadline.getDate() + 7);
  } else if (frequency === "BIWEEKLY") {
    deadline.setDate(deadline.getDate() + 14);
  } else if (frequency === "MONTHLY") {
    deadline.setMonth(deadline.getMonth() + 1);
  }
  return deadline;
}

export async function finalizeActivationIfReady(circleId: string) {
  const circle = await prisma.circle.findUnique({
    where: { id: circleId },
    include: { memberships: true },
  });

  if (!circle) throw new Error("Circle not found");

  const activeMemberships = circle.memberships.filter((m) => m.status === "ACTIVE");
  const provisionedCount = activeMemberships.filter(
    (m) => m.vaProvisionStatus === "PROVISIONED"
  ).length;

  if (activeMemberships.length === 0 || activeMemberships.length !== provisionedCount) {
    return false; // Not all provisioned yet
  }

  // All active members are provisioned, we can activate the circle
  await prisma.$transaction(async (tx) => {
    // Re-check circle status to prevent double-activation within transaction
    const currentCircle = await tx.circle.findUnique({ where: { id: circleId } });
    if (currentCircle?.status !== "FORMING") return;

    await tx.circle.update({
      where: { id: circleId },
      data: {
        status: "ACTIVE",
        currentCycleSeq: 1,
      },
    });

    // Mark pending invites as cancelled
    await tx.circleInvite.updateMany({
      where: { circleId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    const recipient = activeMemberships.find((m) => m.payoutPosition === 1);
    if (!recipient) {
      throw new Error("No recipient found for position 1");
    }

    const potExpectedMinor = circle.contributionMinor * activeMemberships.length;

    await tx.cycle.create({
      data: {
        circleId,
        sequence: 1,
        recipientMembershipId: recipient.id,
        potExpectedMinor,
        deadline: calculateDeadline(circle.frequency),
      },
    });
  });

  return true;
}
