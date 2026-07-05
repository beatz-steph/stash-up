import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session"
import type { CircleDetailRes } from "../dto/circles.dto";
import { prisma } from "@workspace/db";
import { requireCircleMember } from "@/lib/access-control";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  try {
    await requireCircleMember(id, session.user.id);
  } catch (err) {
    if (err instanceof Error) {
      return apiError(err.message, 403);
    }
    return apiError("Unknown error", 403);
  }

  const circle = await prisma.circle.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
            },
          },
        },
        orderBy: { payoutPosition: "asc" },
      },
      invites: {
        where: { status: "PENDING" },
        include: {
          invitedUser: {
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
            },
          },
        },
      },
      cycles: {
        include: { payout: { select: { status: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  });

  if (!circle) {
    return apiError("Circle not found", 404);
  }

  // Fetch current cycle and contributions
  const currentCycle = await prisma.cycle.findUnique({
    where: {
      circleId_sequence: {
        circleId: circle.id,
        sequence: circle.currentCycleSeq || 1, // fallback to 1 if 0
      },
    },
    include: {
      contributions: true,
      payout: true,
    },
  });

  const response = {
    id: circle.id,
    name: circle.name,
    contributionMinor: circle.contributionMinor,
    currency: circle.currency,
    frequency: circle.frequency,
    status: circle.status,
    totalSlots: circle.totalSlots,
    startDeadline: circle.startDeadline,
    createdAt: circle.createdAt,
    renewalCount: circle.renewalCount,
    members: circle.memberships.map((m) => ({
      id: m.id,
      user: m.user,
      role: m.role,
      payoutPosition: m.payoutPosition,
      status: m.status,
      vaProvisionStatus: m.vaProvisionStatus,
    })),
    invites: circle.invites.map((i) => ({
      id: i.id,
      invitedUser: i.invitedUser,
      status: i.status,
      expiresAt: i.expiresAt,
    })),
    currentCycle: currentCycle
      ? {
          id: currentCycle.id,
          sequence: currentCycle.sequence,
          status: currentCycle.status,
          potExpectedMinor: currentCycle.potExpectedMinor,
          potCollectedMinor: currentCycle.potCollectedMinor,
          deadline: currentCycle.deadline,
          recipientMembershipId: currentCycle.recipientMembershipId,
          payout: currentCycle.payout ? {
            id: currentCycle.payout.id,
            status: currentCycle.payout.status,
            amountMinor: currentCycle.payout.amountMinor,
            feeMinor: currentCycle.payout.feeMinor,
            failureReason: currentCycle.payout.failureReason,
          } : null,
        }
      : null,
    contributions: currentCycle
      ? currentCycle.contributions.map((c) => ({
          membershipId: c.membershipId,
          amountMinor: c.amountMinor,
          status: c.status,
        }))
      : [],
    cycles: circle.cycles.map((c) => ({
      id: c.id,
      sequence: c.sequence,
      status: c.status,
      potCollectedMinor: c.potCollectedMinor,
      potExpectedMinor: c.potExpectedMinor,
      recipientMembershipId: c.recipientMembershipId,
      paidOutAt: c.paidOutAt,
      payoutStatus: c.payout?.status ?? null,
    })),
    myBufferMinor:
      circle.memberships.find((m) => m.userId === session.user.id)?.bufferMinor ?? 0,
    myAutoDebitCardId:
      circle.memberships.find((m) => m.userId === session.user.id)?.autoDebitCardId ?? null,
    myAutoDebitWallet:
      circle.memberships.find((m) => m.userId === session.user.id)?.autoDebitWallet ?? false,
  };

  return apiSuccess<CircleDetailRes>(response);
}
