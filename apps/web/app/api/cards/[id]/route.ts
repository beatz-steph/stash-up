import { apiSuccess, apiError } from "@/lib/api/response";
import { getSession } from "@/lib/session";
import { prisma, type Prisma } from "@workspace/db";
import { deleteTokenizedCard } from "@/lib/nomba-client";

/** DELETE /api/cards/[id] — revoke a saved card. Deletes the token at Nomba
 * (best-effort), marks the card REVOKED, and unbinds it from every circle it
 * auto-debited. Only the owning user may revoke their card. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return apiError("Unauthorized", 401);
  }

  const { id } = await params;

  const card = await prisma.savedCard.findUnique({
    where: { id },
    select: { id: true, userId: true, tokenKey: true, status: true },
  });
  if (!card || card.userId !== session.user.id) {
    return apiError("Card not found", 404);
  }
  if (card.status === "REVOKED") {
    return apiSuccess({ success: true });
  }

  // Delete the token at Nomba first, but never let a provider hiccup strand the
  // user with an un-removable card — fall through to the local revoke either way.
  try {
    await deleteTokenizedCard(card.tokenKey);
  } catch (err) {
    console.error(
      "[cards/revoke] Nomba token delete failed (revoking locally):",
      err instanceof Error ? err.message : err
    );
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.membership.updateMany({
      where: { autoDebitCardId: card.id },
      data: { autoDebitCardId: null },
    });
    await tx.savedCard.update({
      where: { id: card.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
  });

  return apiSuccess({ success: true });
}
