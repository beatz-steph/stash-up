-- CreateEnum
CREATE TYPE "VAKind" AS ENUM ('CIRCLE', 'WALLET');

-- CreateEnum
CREATE TYPE "WalletEntryDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletEntrySource" AS ENUM ('TOPUP_BANK', 'TOPUP_CARD', 'BUFFER_SWEEP', 'REFUND_CREDIT', 'CIRCLE_DEBIT', 'WITHDRAWAL', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WalletWithdrawalStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED');

-- DropForeignKey
ALTER TABLE "VirtualAccount" DROP CONSTRAINT "VirtualAccount_membershipId_fkey";

-- AlterTable
ALTER TABLE "ChargeAttempt" ADD COLUMN     "feeMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InboundTransfer" ADD COLUMN     "feeMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "autoDebitWallet" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "feeMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VirtualAccount" ADD COLUMN     "kind" "VAKind" NOT NULL DEFAULT 'CIRCLE',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "membershipId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "virtualAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "direction" "WalletEntryDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfterMinor" INTEGER NOT NULL,
    "source" "WalletEntrySource" NOT NULL,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletWithdrawal" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL DEFAULT 0,
    "merchantTxRef" TEXT NOT NULL,
    "status" "WalletWithdrawalStatus" NOT NULL DEFAULT 'INITIATED',
    "nombaTransferId" TEXT,
    "failureReason" TEXT,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletPin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_virtualAccountId_key" ON "WalletAccount"("virtualAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_walletId_createdAt_idx" ON "WalletLedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_source_idx" ON "WalletLedgerEntry"("source");

-- CreateIndex
CREATE UNIQUE INDEX "WalletWithdrawal_merchantTxRef_key" ON "WalletWithdrawal"("merchantTxRef");

-- CreateIndex
CREATE INDEX "WalletWithdrawal_walletId_createdAt_idx" ON "WalletWithdrawal"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletWithdrawal_status_idx" ON "WalletWithdrawal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletPin_userId_key" ON "WalletPin"("userId");

-- CreateIndex
CREATE INDEX "VirtualAccount_userId_idx" ON "VirtualAccount"("userId");

-- AddForeignKey
ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletWithdrawal" ADD CONSTRAINT "WalletWithdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletPin" ADD CONSTRAINT "WalletPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
