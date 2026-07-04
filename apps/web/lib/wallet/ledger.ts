import "server-only";
import type { Prisma, WalletEntrySource } from "@workspace/db";

/**
 * Wallet ledger primitives — the ONLY way `WalletAccount.balanceMinor` may
 * change. Every mutation is atomic with its append-only `WalletLedgerEntry` and
 * idempotent via `idempotencyKey @unique`. All callers must run these inside a
 * `$transaction` (they take the `tx` client) so a failure rolls everything back.
 *
 * Invariants enforced here (see plan "Core invariants"):
 *  1. balance change ⇔ ledger entry, in one tx.
 *  2. idempotency: a replayed key is a no-op (`applied: false`), no double-post.
 *  3. no overdraw: debits use a conditional SQL guard (`balance >= amount`).
 */

/** Thrown when a debit would overdraw the wallet. Callers surface a 4xx. */
export class WalletInsufficientFundsError extends Error {
  constructor() {
    super("INSUFFICIENT_WALLET_BALANCE");
    this.name = "WalletInsufficientFundsError";
  }
}

export interface WalletMutation {
  userId: string;
  amountMinor: number; // must be > 0
  source: WalletEntrySource;
  /** Deterministic dedup key, e.g. "topup_{inboundTransferId}". */
  idempotencyKey: string;
  /** Optional pointer to what produced this (circleId/withdrawalId/…). */
  reference?: string | null;
}

export interface WalletMutationResult {
  applied: boolean; // false = idempotent replay, nothing changed
  balanceAfterMinor: number;
}

/** Get-or-create the user's wallet inside a tx. Race-safe via upsert. */
export async function ensureWallet(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<{ id: string; balanceMinor: number }> {
  return tx.walletAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true, balanceMinor: true },
  });
}

async function post(
  tx: Prisma.TransactionClient,
  direction: "CREDIT" | "DEBIT",
  params: WalletMutation
): Promise<WalletMutationResult> {
  if (!Number.isInteger(params.amountMinor) || params.amountMinor <= 0) {
    throw new Error(`Wallet ${direction} amount must be a positive integer (kobo)`);
  }

  const wallet = await ensureWallet(tx, params.userId);

  // Idempotency guard FIRST: if the key exists, this op already applied in a
  // prior committed tx → no-op (never touch the balance a second time).
  let entryId: string;
  try {
    const entry = await tx.walletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        direction,
        amountMinor: params.amountMinor,
        balanceAfterMinor: 0, // set below once the balance is mutated
        source: params.source,
        reference: params.reference ?? null,
        idempotencyKey: params.idempotencyKey,
      },
      select: { id: true },
    });
    entryId = entry.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { applied: false, balanceAfterMinor: wallet.balanceMinor };
    }
    throw err;
  }

  // Mutate the balance atomically. Debits carry a conditional guard so two
  // concurrent debits can never overdraw (throws → the whole tx rolls back,
  // undoing the ledger row above).
  let rows: { balanceMinor: number }[];
  if (direction === "CREDIT") {
    rows = await tx.$queryRaw<{ balanceMinor: number }[]>`
      UPDATE "WalletAccount"
      SET "balanceMinor" = "balanceMinor" + ${params.amountMinor}, "updatedAt" = NOW()
      WHERE "id" = ${wallet.id}
      RETURNING "balanceMinor"`;
  } else {
    rows = await tx.$queryRaw<{ balanceMinor: number }[]>`
      UPDATE "WalletAccount"
      SET "balanceMinor" = "balanceMinor" - ${params.amountMinor}, "updatedAt" = NOW()
      WHERE "id" = ${wallet.id} AND "balanceMinor" >= ${params.amountMinor}
      RETURNING "balanceMinor"`;
    if (rows.length === 0) {
      throw new WalletInsufficientFundsError();
    }
  }

  const balanceAfterMinor = Number(rows[0]!.balanceMinor);
  await tx.walletLedgerEntry.update({
    where: { id: entryId },
    data: { balanceAfterMinor },
  });

  return { applied: true, balanceAfterMinor };
}

/** Credit the wallet (money in). Idempotent, atomic with its ledger entry. */
export function creditWallet(
  tx: Prisma.TransactionClient,
  params: WalletMutation
): Promise<WalletMutationResult> {
  return post(tx, "CREDIT", params);
}

/** Debit the wallet (money out / spend). Throws `WalletInsufficientFundsError`
 * if the balance can't cover it. Idempotent, atomic with its ledger entry. */
export function debitWallet(
  tx: Prisma.TransactionClient,
  params: WalletMutation
): Promise<WalletMutationResult> {
  return post(tx, "DEBIT", params);
}
