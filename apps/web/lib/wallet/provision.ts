import "server-only";
import { prisma, type Prisma } from "@workspace/db";
import { createVirtualAccount } from "@/lib/nomba-client";
import { walletAccountName } from "@/lib/nomba-format";

export interface WalletVirtualAccount {
  bankAccountNumber: string;
  bankAccountName: string;
  bankName: string;
}

/**
 * Get-or-create the user's dedicated wallet top-up virtual account (lazy —
 * called the first time they open the bank-top-up view). Idempotent: returns
 * the existing VA if already provisioned. Creates a Nomba VA with
 * `accountRef = "wallet_{userId}"`, kind WALLET (no membership), and links it
 * to the wallet. Money sent here is credited to the wallet ledger by the
 * webhook (Stage 3).
 */
export async function ensureWalletVirtualAccount(
  userId: string
): Promise<WalletVirtualAccount> {
  // Wallet + its VA (if any) in one read.
  const wallet = await prisma.walletAccount.findUnique({
    where: { userId },
    select: {
      id: true,
      virtualAccount: {
        select: { bankAccountNumber: true, bankAccountName: true, bankName: true },
      },
    },
  });
  if (wallet?.virtualAccount) {
    return wallet.virtualAccount;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  if (!user) throw new Error("User not found");

  const accountRef = `wallet_${userId}`;
  const vaRes = await createVirtualAccount({
    accountRef,
    accountName: walletAccountName(user.name),
  });

  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Ensure the wallet exists (create if the GET hasn't yet).
    const w = await tx.walletAccount.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true, virtualAccountId: true },
    });
    // Race: another request may have provisioned it between our read and here.
    if (w.virtualAccountId) {
      const existing = await tx.virtualAccount.findUnique({
        where: { id: w.virtualAccountId },
        select: { bankAccountNumber: true, bankAccountName: true, bankName: true },
      });
      if (existing) return existing;
    }

    const va = await tx.virtualAccount.create({
      data: {
        kind: "WALLET",
        userId,
        provider: "NOMBA",
        accountRef: vaRes.accountRef,
        providerAccountRef: vaRes.accountRef,
        bankAccountNumber: vaRes.bankAccountNumber,
        bankAccountName: vaRes.bankAccountName,
        bankName: vaRes.bankName,
        bankCode: vaRes.bankCode,
        status: "ACTIVE",
      },
      select: {
        id: true,
        bankAccountNumber: true,
        bankAccountName: true,
        bankName: true,
      },
    });
    await tx.walletAccount.update({
      where: { id: w.id },
      data: { virtualAccountId: va.id },
    });
    return {
      bankAccountNumber: va.bankAccountNumber,
      bankAccountName: va.bankAccountName,
      bankName: va.bankName,
    };
  });

  return created;
}
