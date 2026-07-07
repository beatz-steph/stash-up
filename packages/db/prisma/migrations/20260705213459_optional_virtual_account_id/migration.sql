-- DropForeignKey
ALTER TABLE "OrphanTransaction" DROP CONSTRAINT "OrphanTransaction_virtualAccountId_fkey";

-- AlterTable
ALTER TABLE "OrphanTransaction" ALTER COLUMN "virtualAccountId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OrphanTransaction" ADD CONSTRAINT "OrphanTransaction_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
