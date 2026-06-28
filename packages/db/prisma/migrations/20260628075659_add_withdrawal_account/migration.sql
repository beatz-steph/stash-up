-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "CircleStatus" AS ENUM ('FORMING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CircleCancelReason" AS ENUM ('DEADLINE_NOT_MET', 'CREATOR_CANCELLED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('CREATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "VAProvisionStatus" AS ENUM ('PENDING', 'PROVISIONED', 'FAILED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEFAULTED', 'LEFT');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VAStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('OPEN', 'COLLECTING', 'AWAITING_RESOLUTION', 'READY_TO_PAYOUT', 'PAYOUT_INITIATED', 'PAID_OUT', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETE', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'OVERPAID', 'UNDERPAID', 'UNMATCHED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('INITIATED', 'PENDING_BILLING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('ACTIVE', 'INVALID');

-- CreateTable
CREATE TABLE "admin_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "admin_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "phone" TEXT,
    "username" TEXT NOT NULL,
    "lifetimeDefaultCount" INTEGER NOT NULL DEFAULT 0,
    "blockedFromCircles" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contributionMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "frequency" "Frequency" NOT NULL,
    "status" "CircleStatus" NOT NULL DEFAULT 'FORMING',
    "cancelledReason" "CircleCancelReason",
    "totalSlots" INTEGER NOT NULL,
    "startDeadline" TIMESTAMP(3),
    "currentCycleSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CircleInvite" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CircleInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "payoutPosition" INTEGER NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "vaProvisionStatus" "VAProvisionStatus" NOT NULL DEFAULT 'PENDING',
    "bufferMinor" INTEGER NOT NULL DEFAULT 0,
    "defaultCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualAccount" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "accountRef" TEXT NOT NULL,
    "providerAccountRef" TEXT NOT NULL,
    "bankAccountNumber" TEXT NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "status" "VAStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "recipientMembershipId" TEXT NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'OPEN',
    "potExpectedMinor" INTEGER NOT NULL,
    "potCollectedMinor" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidOutAt" TIMESTAMP(3),

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundTransfer" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "providerEventId" TEXT NOT NULL,
    "nombaTransactionId" TEXT NOT NULL,
    "aliasAccountRef" TEXT NOT NULL,
    "virtualAccountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "senderName" TEXT,
    "senderBank" TEXT,
    "senderBankCode" TEXT,
    "senderAccountNumber" TEXT,
    "narration" TEXT,
    "matchStatus" "MatchStatus" NOT NULL,
    "matchedCycleId" TEXT,
    "matchedMembershipId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "recipientMembershipId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "merchantTxRef" TEXT NOT NULL,
    "nombaTransferId" TEXT,
    "nombaStatus" TEXT,
    "recipientAccountNumber" TEXT NOT NULL,
    "recipientBankCode" TEXT NOT NULL,
    "recipientBankName" TEXT NOT NULL,
    "recipientAccountName" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'INITIATED',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "rawPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NombaConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'NOMBA',
    "clientId" TEXT NOT NULL,
    "clientSecretCipher" TEXT NOT NULL,
    "webhookSecretCipher" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://api.nomba.com',
    "status" "ConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NombaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_token_key" ON "admin_session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "Circle_status_idx" ON "Circle"("status");

-- CreateIndex
CREATE INDEX "Circle_createdByUserId_idx" ON "Circle"("createdByUserId");

-- CreateIndex
CREATE INDEX "CircleInvite_invitedUserId_status_idx" ON "CircleInvite"("invitedUserId", "status");

-- CreateIndex
CREATE INDEX "CircleInvite_circleId_status_idx" ON "CircleInvite"("circleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CircleInvite_circleId_invitedUserId_key" ON "CircleInvite"("circleId", "invitedUserId");

-- CreateIndex
CREATE INDEX "Membership_circleId_idx" ON "Membership"("circleId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_circleId_userId_key" ON "Membership"("circleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_circleId_payoutPosition_key" ON "Membership"("circleId", "payoutPosition");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_membershipId_key" ON "VirtualAccount"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_accountRef_key" ON "VirtualAccount"("accountRef");

-- CreateIndex
CREATE INDEX "VirtualAccount_accountRef_idx" ON "VirtualAccount"("accountRef");

-- CreateIndex
CREATE INDEX "VirtualAccount_bankAccountNumber_idx" ON "VirtualAccount"("bankAccountNumber");

-- CreateIndex
CREATE INDEX "Cycle_circleId_status_idx" ON "Cycle"("circleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_circleId_sequence_key" ON "Cycle"("circleId", "sequence");

-- CreateIndex
CREATE INDEX "Contribution_cycleId_idx" ON "Contribution"("cycleId");

-- CreateIndex
CREATE INDEX "Contribution_membershipId_idx" ON "Contribution"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_cycleId_membershipId_key" ON "Contribution"("cycleId", "membershipId");

-- CreateIndex
CREATE INDEX "InboundTransfer_aliasAccountRef_idx" ON "InboundTransfer"("aliasAccountRef");

-- CreateIndex
CREATE INDEX "InboundTransfer_matchStatus_idx" ON "InboundTransfer"("matchStatus");

-- CreateIndex
CREATE INDEX "InboundTransfer_receivedAt_idx" ON "InboundTransfer"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundTransfer_provider_providerEventId_key" ON "InboundTransfer"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_cycleId_key" ON "Payout"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_merchantTxRef_key" ON "Payout"("merchantTxRef");

-- CreateIndex
CREATE INDEX "WebhookReceipt_processed_createdAt_idx" ON "WebhookReceipt"("processed", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookReceipt_eventType_idx" ON "WebhookReceipt"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_provider_providerEventId_key" ON "WebhookReceipt"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminUserId_idx" ON "admin_audit_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entityType_entityId_idx" ON "admin_audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_account_userId_key" ON "withdrawal_account"("userId");

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_account" ADD CONSTRAINT "admin_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circle" ADD CONSTRAINT "Circle_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvite" ADD CONSTRAINT "CircleInvite_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvite" ADD CONSTRAINT "CircleInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CircleInvite" ADD CONSTRAINT "CircleInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_recipientMembershipId_fkey" FOREIGN KEY ("recipientMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundTransfer" ADD CONSTRAINT "InboundTransfer_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundTransfer" ADD CONSTRAINT "InboundTransfer_matchedCycleId_fkey" FOREIGN KEY ("matchedCycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_recipientMembershipId_fkey" FOREIGN KEY ("recipientMembershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_account" ADD CONSTRAINT "withdrawal_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
