import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma } from "@workspace/db";
import type { SavedCardListRes } from "./dto/cards.dto";

/** GET /api/cards — the requesting user's saved cards (excluding revoked),
 * each with the circles it currently auto-debits. tokenKey is NEVER returned. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const cards = await prisma.savedCard.findMany({
    where: { userId: session.user.id, status: { not: "REVOKED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      last4: true,
      cardType: true,
      status: true,
      createdAt: true,
      boundMemberships: {
        select: { circle: { select: { id: true, name: true } } },
      },
    },
  });

  const res: SavedCardListRes = cards.map((c) => ({
    id: c.id,
    last4: c.last4,
    cardType: c.cardType,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    boundCircles: c.boundMemberships.map((m) => ({
      circleId: m.circle.id,
      circleName: m.circle.name,
    })),
  }));

  return apiSuccess<SavedCardListRes>(res);
}
