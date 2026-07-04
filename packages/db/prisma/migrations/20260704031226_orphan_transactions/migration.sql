-- CreateEnum
CREATE TYPE "OrphanStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "OrphanTransaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "nombaTransactionId" TEXT NOT NULL,
    "virtualAccountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "entryType" TEXT NOT NULL,
    "txType" TEXT,
    "senderName" TEXT,
    "narration" TEXT,
    "sessionId" TEXT,
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "spooledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OrphanStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedByAdminId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "inboundTransferId" TEXT,

    CONSTRAINT "OrphanTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrphanTransaction_nombaTransactionId_key" ON "OrphanTransaction"("nombaTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrphanTransaction_inboundTransferId_key" ON "OrphanTransaction"("inboundTransferId");

-- CreateIndex
CREATE INDEX "OrphanTransaction_status_transactionAt_idx" ON "OrphanTransaction"("status", "transactionAt");

-- CreateIndex
CREATE INDEX "OrphanTransaction_virtualAccountId_idx" ON "OrphanTransaction"("virtualAccountId");

-- AddForeignKey
ALTER TABLE "OrphanTransaction" ADD CONSTRAINT "OrphanTransaction_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
