-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ChargeAttemptStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChargePurpose" AS ENUM ('CONTRIBUTION', 'ENROLLMENT', 'VERIFICATION');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'REFUNDED', 'FAILED');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "autoDebitCardId" TEXT;

-- CreateTable
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "tokenKey" TEXT NOT NULL,
    "last4" TEXT,
    "cardType" TEXT,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeAttempt" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT,
    "membershipId" TEXT,
    "userId" TEXT NOT NULL,
    "savedCardId" TEXT,
    "purpose" "ChargePurpose" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "orderReference" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ChargeAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "nombaTransactionId" TEXT,
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ChargeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedCard_userId_idx" ON "SavedCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeAttempt_orderReference_key" ON "ChargeAttempt"("orderReference");

-- CreateIndex
CREATE INDEX "ChargeAttempt_status_createdAt_idx" ON "ChargeAttempt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChargeAttempt_refundStatus_idx" ON "ChargeAttempt"("refundStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeAttempt_cycleId_membershipId_attemptNumber_key" ON "ChargeAttempt"("cycleId", "membershipId", "attemptNumber");

-- CreateIndex
CREATE INDEX "Membership_autoDebitCardId_idx" ON "Membership"("autoDebitCardId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_autoDebitCardId_fkey" FOREIGN KEY ("autoDebitCardId") REFERENCES "SavedCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAttempt" ADD CONSTRAINT "ChargeAttempt_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAttempt" ADD CONSTRAINT "ChargeAttempt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
