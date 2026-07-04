-- DropForeignKey
ALTER TABLE "InboundTransfer" DROP CONSTRAINT "InboundTransfer_virtualAccountId_fkey";

-- AlterTable
ALTER TABLE "InboundTransfer" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'VA_TRANSFER',
ALTER COLUMN "aliasAccountRef" DROP NOT NULL,
ALTER COLUMN "virtualAccountId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "InboundTransfer" ADD CONSTRAINT "InboundTransfer_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
