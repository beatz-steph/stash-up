# PRD + ERD — Ajo / Esusu Digital Thrift App
# Nomba x DevCareer Hackathon 2026

> **For the implementation session:** decisions are made. Do not re-litigate them.
> If something looks wrong, flag it and proceed. This document supersedes the
> earlier `nomba-ajo-hackathon-handover.md` for all schema and product logic.

---

## 0. TL;DR

- **Hackathon:** Nomba x DevCareer 2026 — Build Track → "Virtual Accounts as Infrastructure"
- **Product:** Digital Ajo/Esusu — a rotating savings circle (ROSCA) built on Nomba Virtual Accounts + Transfers + Webhooks
- **Stack:** Single Next.js (App Router) monolith, Neon PostgreSQL, Prisma 7, BetterAuth, Vercel
- **Judged on:** Reconciliation logic depth, over/underpayment handling, customer-level reporting, Nomba integration breadth
- **Prize pool:** USD $6,500 (1st $4,000 / 2nd $1,500 / 3rd $1,000)
- **Build window:** 1–7 July 2026. Submission deadline: 11:59 PM WAT 7 July 2026

---

## 1. Hackathon Timeline

| Phase | Dates |
|-------|-------|
| Registration | 8–23 June 2026 |
| Onboarding & training | 24–29 June 2026 — get sandbox creds, attend office hours |
| **Building** | **1–7 July 2026** — all substantive commits must be in this window |
| Judging | 8–14 July 2026 |
| Demo Day | 19 July 2026 |

---

## 2. Core Concepts

| Concept | Definition |
|---------|-----------|
| **Circle** | A thrift group. Fixed contribution amount, frequency, ordered rotation. |
| **Membership** | A user's seat in a circle with a fixed payout position (1..N). |
| **Cycle** | One rotation period. Has a recipient, expected pot, collected pot, deadline, and state. |
| **Contribution** | A member's total payment toward the current cycle. May be fulfilled across multiple bank transfers. |
| **Virtual Account** | One Nomba VA per Membership. Permanent (no `expectedAmount`, no `expiryDate`). Used across all cycles. `accountRef = membership_{membershipId}`. |
| **Buffer** | `Membership.bufferMinor` — accumulated surplus from overpayments or partials, applied to future cycles. |
| **Payout** | When a cycle completes, the collected pot is transferred to the recipient via Nomba Transfers — exactly once, with idempotency. |
| **Circle Invite** | An invitation to join a circle, sent by the circle creator to a registered user by their `@username`. |

---

## 3. User Roles

| Role | Who | Permissions |
|------|-----|-------------|
| **Circle Creator** | The member who created the circle | Invite members, set rotation order, cancel circle, resolve defaulters. Also a regular member with a payout position. |
| **Member** | Any accepted circle participant | View circle state, contribute, receive payout on their turn. |
| **Platform Admin** | Separate `AdminUser` (different BetterAuth instance) | View all circles and users, manage platform config (Nomba credentials), audit logs. |

---

## 4. Identity — Username / Tag System

- Every user gets a `@username` at signup (unique, alphanumeric + underscore).
- Circle creators search for members by `@username` to send invites.
- **Requirement:** all invited members must already be registered on the platform.
- No invite-by-phone for non-users in MVP. (Post-MVP: SMS signup link on invite.)

---

## 5. Circle Lifecycle

### 5.1 Formation (FORMING)

```
Circle created (creator sets: name, contributionAmount, frequency, totalSlots, startDeadline, rotation order)
  ↓
Creator invites members by @username → CircleInvite rows created (PENDING)
  ↓
Each invited member: ACCEPTED → Membership created (vaProvisionStatus = PENDING), NO VA yet
                     DECLINED → slot freed, creator can invite someone else
                     EXPIRED  → slot freed (invite has expiresAt)
  ↓
IF accepted memberships == totalSlots:
    → Provision VAs for ALL members (N sequential Nomba API calls)
    → Each success: VirtualAccount created, Membership.vaProvisionStatus = PROVISIONED
    → Any failure:  Membership.vaProvisionStatus = FAILED — circle stays FORMING
                    Creator notified: "VA provisioning failed for @username — retry or re-invite"
    → All N provisioned → Circle → ACTIVE → Cycle 1 opens
    → Members notified: "Your circle is live. Your account number is XXXX XXXX XXXX. Start contributing!"

IF startDeadline passes AND memberships < totalSlots → Circle → CANCELLED
    └─ No VAs were ever provisioned — just mark CANCELLED and notify accepted members. No cleanup needed.
```

**Rules:**
- `totalSlots` is fixed at creation — never changes
- No `minSlots`, no slot reduction
- VAs are **not provisioned during FORMING** — members cannot accidentally send money to a non-active circle
- Circle cannot go ACTIVE until **all** member VAs are successfully provisioned
- If circle is CANCELLED at deadline: no refund (no money was collected), no VA cleanup (none exist). Members notified only.
- Creator can manually cancel a FORMING circle before ACTIVE — same outcome: no VAs exist, just notify
- Once ACTIVE: **no further edits to circle settings, slots, or rotation order**

### 5.2 Active (ACTIVE)

One cycle is open at a time. Cycles run sequentially until all members have received their payout.

```
Cycle 1 opens (recipient = member at payoutPosition 1)
  ↓ contributions come in via bank transfers to VAs
Cycle 1 closes (all contributions complete OR deadline passes with resolution)
  ↓ payout to recipient
Cycle 2 opens (recipient = member at payoutPosition 2)
  ↓ ...
Cycle N closes → Circle → COMPLETED
```

### 5.3 Completed / Cancelled

- **COMPLETED:** all N cycles closed, all members paid once
- **CANCELLED:** cancelled before or during FORMING. Not possible once ACTIVE.

---

## 6. Cycle State Machine

```
OPEN → COLLECTING → AWAITING_RESOLUTION (if deadline passes with missing contributions)
                 ↘                    ↓ (creator resolves: proceed or extend once)
                  → READY_TO_PAYOUT → PAYOUT_INITIATED → PAID_OUT → CLOSED
```

| Status | Meaning |
|--------|---------|
| `OPEN` | Cycle created, no contributions yet |
| `COLLECTING` | At least one contribution received |
| `AWAITING_RESOLUTION` | Cycle deadline passed, not all contributions complete. Creator notified. |
| `READY_TO_PAYOUT` | All contributions complete (or creator chose to proceed with partial pot) |
| `PAYOUT_INITIATED` | Nomba Transfer call made. Waiting for `payout_success` webhook. |
| `PAID_OUT` | Nomba confirmed transfer success |
| `CLOSED` | Admin finalised, next cycle opened |
| `CANCELLED` | Circle was cancelled before this cycle completed (should not happen once ACTIVE) |

**Cycle deadline:** auto-calculated at cycle creation from `Circle.frequency`:
- WEEKLY → `openedAt + 7 days`
- BIWEEKLY → `openedAt + 14 days`
- MONTHLY → `openedAt + 30 days`

**Sandbox demo mode:** cycle deadline can be overridden to 60 seconds for live demo.

---

## 7. Contribution + Reconciliation

### 7.1 The Contribution Model

One `Contribution` row per member per cycle, created when the cycle opens.
`amountMinor` is a running total — it accumulates across multiple bank transfers.

### 7.2 Webhook → Reconciliation Flow

```
Member bank transfer → Nomba fires payment_success webhook
  ↓
1. Dedup: INSERT WebhookReceipt (providerEventId = webhook.requestId @unique)
          Duplicate → 200 OK, stop. Nomba retries on non-200.
  ↓
2. Verify HmacSHA256 signature (nomba-signature header, timing-safe comparison)
  ↓
3. Lookup: aliasAccountReference → VirtualAccount.accountRef → Membership → current open Cycle
  ↓
4. INSERT InboundTransfer (amountMinor = transactionAmount × 100)
  ↓
5. Reconcile (inside $transaction):
   runningTotal = contribution.amountMinor + membership.bufferMinor + inbound.amountMinor

   if runningTotal == contributionMinor  → Contribution COMPLETE, buffer = 0
   if runningTotal >  contributionMinor  → Contribution COMPLETE, buffer = surplus
   if runningTotal <  contributionMinor  → Contribution PARTIAL, accumulate running total, buffer = 0
  ↓
6. Update: Cycle.potCollectedMinor, Contribution.amountMinor + status, Membership.bufferMinor
  ↓
7. Notify member (in-app)
  ↓
8. If all Contributions COMPLETE → Cycle → READY_TO_PAYOUT → trigger payout
```

### 7.3 Reconciliation Match Statuses

| matchStatus | Condition |
|-------------|-----------|
| `MATCHED` | Transfer exactly completes the contribution (with or without buffer assist) |
| `OVERPAID` | Transfer + buffer > contribution amount. Surplus → buffer |
| `UNDERPAID` | Transfer + buffer < contribution amount. Still PARTIAL |
| `UNMATCHED` | No open cycle found for this VA. Credit to buffer, notify |
| `MANUAL` | Cannot resolve member/cycle at all. Flag for admin review — never drop funds |

---

## 8. Payout Safety (Non-Negotiable)

Three-layer defence — all three must exist:

1. **`Payout.cycleId @unique`** — DB constraint. Second insert rejected outright.
2. **`SELECT FOR UPDATE` row lock** on Cycle inside `$transaction` before creating Payout row. Re-read `cycle.status` inside the transaction; if already `PAYOUT_INITIATED`, abort.
3. **Deterministic `merchantTxRef = payout_{cycleId}`** sent to Nomba Transfers as the idempotency key. Nomba deduplicates on their side.

**Payout API call (after transaction commits):**
```
POST /v2/transfers/bank
{
  amount: payout.amountMinor / 100,        // Naira — Nomba API is NOT kobo
  accountNumber: recipientVA.bankAccountNumber,
  bankCode: recipientVA.bankCode,
  accountName: recipientVA.bankAccountName,
  merchantTxRef: `payout_${cycleId}`,
  narration: `Ajo payout — ${circle.name} round ${cycle.sequence}`
}
```

**On Nomba REFUND/FAILED status:** update `Payout.status = FAILED`, revert `Cycle.status = READY_TO_PAYOUT`, alert circle creator. Do NOT auto-retry.

---

## 9. Defaulter Handling

**Trigger:** cycle `deadline` passes and not all Contributions are COMPLETE.

**What happens:**
1. Cron job (or on-demand check) detects deadline passed
2. Non-COMPLETE contributions → `Contribution.status = DEFAULTED`
3. `Cycle.status = AWAITING_RESOLUTION`
4. `Membership.defaultCount += 1` for each defaulter
5. Circle creator notified with list of defaulters and amounts short

**Creator's options (once only):**
| Action | Result |
|--------|--------|
| **Proceed with partial pot** | Cycle → READY_TO_PAYOUT with `potCollectedMinor` as-is. Recipient gets less. All members see the shortfall. |
| **Extend deadline (once)** | New deadline set. Cycle stays AWAITING_RESOLUTION. One extension maximum. |

**Defaulter consequences:**
- `Membership.defaultCount >= 2` → `Membership.status = SUSPENDED`
- Suspended member's payout position is skipped on rotation — they must clear arrears before being reinstated
- `User.lifetimeDefaultCount` incremented — visible to future circle creators when inviting

---

## 10. Nomba API Notes (Verified Against Docs)

| Field | Detail |
|-------|--------|
| **Amounts** | Nomba API uses **full Naira** (not kobo). We store kobo internally. Conversion: `naira = minorAmount / 100` (outbound), `minor = transactionAmount × 100` (inbound). |
| **Webhook dedup key** | `requestId` at the **top level** of the webhook body — NOT `data.transaction.transactionId` |
| **VA lookup key** | `data.transaction.aliasAccountReference` = our `accountRef` set at VA creation |
| **VA type** | Static (permanent) — no `expiryDate`, no `expectedAmount` (partial contributions are core) |
| **Sandbox limits** | Max 2 VAs per user, max ₦150 per transfer |
| **Transfer statuses** | SUCCESS / PENDING_BILLING / NEW / REFUND — store all, wait for `payout_success` webhook |
| **Webhook signature** | `nomba-signature` header, HmacSHA256, base64-encoded, timing-safe comparison |

**Must confirm in onboarding office hours:**
- BVN/KYC requirement for VA provisioning
- Production VA limit per user (sandbox = 2)
- bankCode format for Transfers API (NIBSS?)
- Exact endpoint path for VA suspension

---

## 11. Full Prisma Schema

Three-file split using Prisma 7 `prismaSchemaFolder`.

### File: `packages/db/prisma/schema.prisma` (generator config)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = []
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### File: `packages/db/prisma/auth.prisma` (BetterAuth — user app)

> Generate with: `npx auth@latest generate` using the user app BetterAuth config.
> Add `username String @unique` via `additionalFields` in auth config.
> BetterAuth `generate` is supported for Prisma; `migrate` is NOT (run `prisma migrate dev` manually after).

```prisma
// Generated by BetterAuth CLI — do not hand-edit
// additionalFields: { phone: { type: "string", required: false }, username: { type: "string", required: true } }

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  phone         String?
  username      String    @unique   // @handle — used for circle invites
  lifetimeDefaultCount Int @default(0)   // platform-level reputation
  blockedFromCircles   Boolean @default(false)

  sessions      Session[]
  accounts      Account[]
  memberships   Membership[]
  sentInvites   CircleInvite[] @relation("InvitedBy")
  receivedInvites CircleInvite[] @relation("InvitedUser")

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime
  @@map("account")
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?
  @@map("verification")
}
```

### File: `packages/db/prisma/admin-auth.prisma` (BetterAuth — admin app)

> Generate with: `npx auth@latest generate` using the admin BetterAuth config.
> Admin config uses: `user: { modelName: "AdminUser" }`, `session: { modelName: "AdminSession" }`,
> `account: { modelName: "AdminAccount" }`, `verification: { modelName: "AdminVerification" }`.
> Admin auth requires 2FA (TOTP plugin). No OAuth/social login.

```prisma
// Generated by BetterAuth CLI — admin instance, separate model names

model AdminUser {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  role          AdminRole @default(SUPPORT)

  sessions      AdminSession[]
  accounts      AdminAccount[]
  auditLogs     AdminAuditLog[]

  @@map("admin_user")
}

model AdminSession {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      AdminUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("admin_session")
}

model AdminAccount {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  AdminUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime
  @@map("admin_account")
}

model AdminVerification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?
  @@map("admin_verification")
}
```

### File: `packages/db/prisma/business.prisma` (application domain)

```prisma
// ─── Enums ────────────────────────────────────────────────────────────────────

enum AdminRole {
  SUPER_ADMIN
  SUPPORT
}

enum CircleStatus {
  FORMING
  ACTIVE
  COMPLETED
  CANCELLED
}

enum CircleCancelReason {
  DEADLINE_NOT_MET    // auto-cancelled: totalSlots never filled by startDeadline
  CREATOR_CANCELLED   // creator manually cancelled while still FORMING
}

enum Frequency {
  WEEKLY
  BIWEEKLY
  MONTHLY
}

enum MemberRole {
  CREATOR   // has circle management permissions (still has a payout position)
  MEMBER
}

enum VAProvisionStatus {
  PENDING       // membership exists, VA not yet provisioned (circle still FORMING)
  PROVISIONED   // VA created successfully
  FAILED        // Nomba call failed — blocks circle activation until retried or member replaced
}

enum MemberStatus {
  ACTIVE
  SUSPENDED     // defaulted too many times — payout skipped until arrears cleared
  DEFAULTED     // permanently removed from circle
  LEFT          // left before circle became ACTIVE (cannot leave mid-cycle)
}

enum InviteStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
  CANCELLED    // creator withdrew the invite
}

enum VAStatus {
  ACTIVE
  SUSPENDED
  CLOSED
}

enum CycleStatus {
  OPEN
  COLLECTING
  AWAITING_RESOLUTION   // deadline passed, not all contributions complete
  READY_TO_PAYOUT
  PAYOUT_INITIATED
  PAID_OUT
  CLOSED
  CANCELLED
}

enum ContributionStatus {
  PENDING
  PARTIAL
  COMPLETE
  DEFAULTED    // deadline passed and never completed
}

enum MatchStatus {
  MATCHED
  OVERPAID
  UNDERPAID
  UNMATCHED
  MANUAL
}

enum PayoutStatus {
  INITIATED
  PENDING_BILLING
  SUCCESS
  FAILED
  REFUNDED
}

enum ConfigStatus {
  ACTIVE
  INVALID
}

// ─── Models ───────────────────────────────────────────────────────────────────

model Circle {
  id                  String              @id @default(cuid())
  name                String
  contributionMinor   Int                 // per-member per-cycle (kobo)
  currency            String              @default("NGN")
  frequency           Frequency
  status              CircleStatus        @default(FORMING)
  cancelledReason     CircleCancelReason?
  totalSlots          Int                 // fixed at creation, never changes
  startDeadline       DateTime?           // if not full by this date → CANCELLED
  currentCycleSeq     Int                 @default(0)
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  createdByUserId     String              // FK to User (the creator member)

  memberships         Membership[]
  cycles              Cycle[]
  invites             CircleInvite[]

  @@index([status])
  @@index([createdByUserId])
}

model CircleInvite {
  id              String       @id @default(cuid())
  circleId        String
  circle          Circle       @relation(fields: [circleId], references: [id])
  invitedUserId   String       // must be a registered user — looked up by @username
  invitedUser     User         @relation("InvitedUser", fields: [invitedUserId], references: [id])
  invitedByUserId String       // the circle creator
  invitedBy       User         @relation("InvitedBy", fields: [invitedByUserId], references: [id])
  status          InviteStatus @default(PENDING)
  expiresAt       DateTime     // after this → auto-EXPIRED, slot freed
  createdAt       DateTime     @default(now())

  @@unique([circleId, invitedUserId])   // no duplicate invites to same person
  @@index([invitedUserId, status])
  @@index([circleId, status])
}

model Membership {
  id             String       @id @default(cuid())
  circleId       String
  circle         Circle       @relation(fields: [circleId], references: [id])
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  role              MemberRole        @default(MEMBER)
  payoutPosition    Int               // 1..N rotation order, set by creator at circle creation
  status            MemberStatus      @default(ACTIVE)
  vaProvisionStatus VAProvisionStatus @default(PENDING)  // tracks VA provisioning at activation
  bufferMinor       Int               @default(0)   // accumulated surplus/partial across cycles
  defaultCount      Int               @default(0)   // cycles this member has defaulted on
  joinedAt          DateTime          @default(now())

  virtualAccount  VirtualAccount?
  contributions   Contribution[]
  payoutsReceived Payout[]        @relation("RecipientMembership")
  recipientCycles Cycle[]         @relation("RecipientMembership")

  @@unique([circleId, userId])
  @@unique([circleId, payoutPosition])
  @@index([circleId])
  @@index([userId])
}

model VirtualAccount {
  id                  String     @id @default(cuid())
  membershipId        String     @unique
  membership          Membership @relation(fields: [membershipId], references: [id])
  provider            String     @default("NOMBA")
  // accountRef is our reference sent to Nomba at VA creation — webhook lookup key
  accountRef          String     @unique   // = "membership_{membershipId}"
  providerAccountRef  String               // Nomba's own VA id (for suspend/manage calls)
  bankAccountNumber   String               // issued by Nomba — shown to member for transfers
  bankAccountName     String
  bankName            String
  bankCode            String               // NIBSS bank code — needed for Transfers API payout
  status              VAStatus   @default(ACTIVE)
  createdAt           DateTime   @default(now())

  inboundTransfers    InboundTransfer[]

  @@index([accountRef])
  @@index([bankAccountNumber])
}

model Cycle {
  id                    String      @id @default(cuid())
  circleId              String
  circle                Circle      @relation(fields: [circleId], references: [id])
  sequence              Int                          // 1..N
  recipientMembershipId String
  recipientMembership   Membership  @relation("RecipientMembership", fields: [recipientMembershipId], references: [id])
  status                CycleStatus @default(OPEN)
  potExpectedMinor      Int                          // contributionMinor × activeMembers
  potCollectedMinor     Int         @default(0)
  deadline              DateTime                     // auto-set from Circle.frequency at cycle open
  openedAt              DateTime    @default(now())
  paidOutAt             DateTime?

  contributions         Contribution[]
  payout                Payout?
  inboundTransfers      InboundTransfer[] @relation("MatchedCycle")

  @@unique([circleId, sequence])
  @@index([circleId, status])
}

model Contribution {
  id           String             @id @default(cuid())
  cycleId      String
  cycle        Cycle              @relation(fields: [cycleId], references: [id])
  membershipId String
  membership   Membership         @relation(fields: [membershipId], references: [id])
  amountMinor  Int                @default(0)   // running total accumulated this cycle
  status       ContributionStatus @default(PENDING)
  updatedAt    DateTime           @updatedAt

  @@unique([cycleId, membershipId])
  @@index([cycleId])
  @@index([membershipId])
}

model InboundTransfer {
  id                  String      @id @default(cuid())
  provider            String      @default("NOMBA")
  // providerEventId = webhook.requestId (top-level) — NOT data.transaction.transactionId
  providerEventId     String
  nombaTransactionId  String               // data.transaction.transactionId
  aliasAccountRef     String               // data.transaction.aliasAccountReference → VirtualAccount.accountRef
  virtualAccountId    String
  virtualAccount      VirtualAccount @relation(fields: [virtualAccountId], references: [id])
  amountMinor         Int                  // transactionAmount × 100 (stored in kobo)
  currency            String      @default("NGN")
  senderName          String?
  senderBank          String?
  senderBankCode      String?
  senderAccountNumber String?
  narration           String?
  matchStatus         MatchStatus
  matchedCycleId      String?
  matchedCycle        Cycle?      @relation("MatchedCycle", fields: [matchedCycleId], references: [id])
  matchedMembershipId String?
  receivedAt          DateTime

  @@unique([provider, providerEventId])
  @@index([aliasAccountRef])
  @@index([matchStatus])
  @@index([receivedAt])
}

model Payout {
  id                     String       @id @default(cuid())
  cycleId                String       @unique          // DB-level double-payout guard
  cycle                  Cycle        @relation(fields: [cycleId], references: [id])
  recipientMembershipId  String
  recipientMembership    Membership   @relation("RecipientMembership", fields: [recipientMembershipId], references: [id])
  amountMinor            Int
  // merchantTxRef = "payout_{cycleId}" — deterministic idempotency key sent to Nomba
  merchantTxRef          String       @unique
  nombaTransferId        String?
  nombaStatus            String?
  recipientAccountNumber String
  recipientBankCode      String
  recipientBankName      String
  recipientAccountName   String
  status                 PayoutStatus @default(INITIATED)
  failureReason          String?
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
}

model WebhookReceipt {
  id              String    @id @default(cuid())
  provider        String    @default("NOMBA")
  // providerEventId = webhook.requestId (top-level) — dedup key
  providerEventId String
  eventType       String    // payment_success | payout_success | etc.
  payloadHash     String    // sha256(rawBody)
  signatureValid  Boolean
  processed       Boolean   @default(false)
  processedAt     DateTime?
  processingError String?
  rawPayload      String    @db.Text
  createdAt       DateTime  @default(now())

  @@unique([provider, providerEventId])
  @@index([processed, createdAt])
  @@index([eventType])
}

model NombaConfig {
  id                  String       @id @default(cuid())
  provider            String       @default("NOMBA")
  clientId            String
  clientSecretCipher  String       @db.Text   // encrypted; env-scoped ok for sandbox
  webhookSecretCipher String       @db.Text
  baseUrl             String       @default("https://api.nomba.com")
  status              ConfigStatus @default(ACTIVE)
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
}

model AdminAuditLog {
  id          String    @id @default(cuid())
  adminUserId String    // FK to AdminUser in admin-auth.prisma
  action      String
  entityType  String?
  entityId    String?
  metadata    Json?
  createdAt   DateTime  @default(now())

  @@index([adminUserId])
  @@index([entityType, entityId])
  @@map("admin_audit_logs")
}
```

---

## 12. Entity Relationship Diagram (text)

```
User ────────────────────────────────┐
 │                                   │
 │ 1:N                               │ 1:N (invitedBy / invitedUser)
 ▼                                   ▼
Membership ◄──────────── CircleInvite
 │     └──────────────────────────► Circle
 │                                    │
 │ 1:1                                │ 1:N
 ▼                                    ▼
VirtualAccount                        Cycle ──────────► Payout (1:1, cycleId @unique)
 │                                     │
 │ 1:N                                 │ 1:N
 ▼                                     ▼
InboundTransfer ────────────────► Contribution (1 per Membership per Cycle)
(matchedCycle FK)

AdminUser ──► AdminAuditLog
AdminUser ──► AdminSession / AdminAccount (BetterAuth)
```

---

## 13. Monorepo Layout

```
ajo/
├── apps/
│   ├── user/                  — Next.js (App Router) — member dashboard (port 3000)
│   └── admin/                 — Next.js (App Router) — platform admin (port 3001)
├── packages/
│   ├── db/
│   │   └── prisma/
│   │       ├── schema.prisma       — generator + datasource
│   │       ├── auth.prisma         — BetterAuth user tables
│   │       ├── admin-auth.prisma   — BetterAuth admin tables
│   │       └── business.prisma     — application domain
│   └── ui/                    — Shared shadcn/ui components
├── package.json               — pnpm workspaces
└── .env                       — DATABASE_URL, NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, etc.
```

Both `apps/user` and `apps/admin` are **full-stack Next.js** — webhook routes, API routes, and UI all in the same app. No separate backend service. Deploy both to Vercel.

### Two BetterAuth instances, one DB

```
apps/user → auth config → user BetterAuth instance → user/session/account tables
apps/admin → auth config → admin BetterAuth instance → admin_user/admin_session/admin_account tables
```

Both point to the same `DATABASE_URL`. Prisma's `prismaSchemaFolder` merges all four `.prisma` files into one migration. Tables don't conflict (admin tables use `admin_` prefix via `@@map`).

---

## 14. Tech Stack Decisions

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend + API | Next.js 15 (App Router) | One deploy, route handlers for webhooks, clean public URL |
| Database | Neon PostgreSQL | Serverless, free tier, Prisma-native |
| ORM | Prisma 7 | Split schema support, strong types |
| Auth | BetterAuth (two instances) | One for users, one for admins — same DB |
| UI | Tailwind + shadcn/ui | Fast, polished, accessible |
| State | TanStack Query 5 | Query invalidation, optimistic updates |
| Forms | React Hook Form + Zod | Same stack as reference implementation |
| Payments | Nomba Virtual Accounts + Transfers + Webhooks | The whole point |
| Deploy | Vercel | One command, stable webhook URL, edge runtime for webhooks |
| Notifications | Resend (email) | Simple, one integration |

---

## 15. Build Plan (1–7 July 2026)

### Day 1 — Foundation
- [ ] `pnpm create next-app` — both apps, pnpm workspaces, `packages/db`
- [ ] Prisma 7 config: `prismaSchemaFolder`, all four `.prisma` files stubbed
- [ ] Run `npx auth@latest generate` for both BetterAuth configs
- [ ] First migration: `npx prisma migrate dev --name init`
- [ ] Deploy skeleton to Vercel (lock the public URL for Nomba webhook registration)
- [ ] Wire Nomba sandbox credentials into `NombaConfig` table

### Day 2 — Identity + Circle Formation
- [ ] User signup/login (BetterAuth, email+password, username at signup)
- [ ] Circle creation form (name, amount, frequency, slots, startDeadline, rotation order)
- [ ] Invite by @username flow: search user → create `CircleInvite`
- [ ] Accept/decline invite flow → `Membership` created (`vaProvisionStatus = PENDING`), no VA yet
- [ ] Circle ACTIVE trigger (all slots filled):
  - Provision VAs for all members sequentially via Nomba API
  - On each success: create `VirtualAccount`, set `Membership.vaProvisionStatus = PROVISIONED`
  - On any failure: set `vaProvisionStatus = FAILED`, notify creator with retry option
  - Only when all N members PROVISIONED: `Circle → ACTIVE`, Cycle 1 opens, members notified with their account numbers
- [ ] Circle CANCELLED trigger (deadline passes, slots not full): mark CANCELLED, notify members — no VA cleanup needed (none were provisioned)

### Day 3 — Webhook + Reconciliation Engine
- [ ] `app/api/webhooks/nomba/route.ts` — raw body capture (no `bodyParser`)
- [ ] `WebhookReceipt` dedup (providerEventId = requestId)
- [ ] HmacSHA256 signature verification (timing-safe)
- [ ] `InboundTransfer` creation
- [ ] Reconciliation logic: buffer + running total → MATCHED/OVERPAID/UNDERPAID/UNMATCHED/MANUAL
- [ ] `Contribution` and `Cycle.potCollectedMinor` update inside `$transaction`

### Day 4 — Cycle State Machine + Payout
- [ ] Cycle deadline cron (or route-based trigger for demo)
- [ ] AWAITING_RESOLUTION handling: notify creator, list defaulters
- [ ] READY_TO_PAYOUT → payout trigger:
  - `SELECT FOR UPDATE` lock
  - `Payout` row creation (`cycleId @unique`)
  - `POST /v2/transfers/bank` call (Naira, `merchantTxRef = payout_{cycleId}`)
- [ ] `payout_success` webhook → `Payout.status = SUCCESS`, `Cycle → PAID_OUT → CLOSED`
- [ ] Rotation advance: open Cycle N+1 for next payoutPosition
- [ ] Circle COMPLETED when last cycle closes

### Day 5 — Dashboard UX
- [ ] Circle overview: rotation wheel, who's next, pot progress bar
- [ ] Live contribution feed: per-member status (paid/partial/pending/defaulted)
- [ ] Member's own view: my VA account number, my contribution this cycle, my payout position
- [ ] Circle ledger: all InboundTransfers + Payouts, exportable
- [ ] Admin panel: all circles, all users, NombaConfig management, audit log

### Day 6 — Polish + Edge Cases
- [ ] Email notifications (Resend): VA provisioned, contribution received, payout sent, cycle opened
- [ ] Buffer credit display: "₦2,000 carried from last cycle"
- [ ] Partial contribution display: "₦6,000 of ₦10,000 received"
- [ ] Sandbox fast-forward mode: 60-second cycle deadline for demo
- [ ] Mobile responsiveness (320px+)
- [ ] Empty, loading, error states everywhere
- [ ] Seed script: demo circle with 5 members, pre-seeded contributions

### Day 7 — Ship
- [ ] Record 2–3 min demo video (see §17)
- [ ] Write architecture + security note (see §18)
- [ ] Finalize README with hosted URL + test credentials
- [ ] Verify public GitHub commit history is within hackathon dates
- [ ] Submit before 11:59 PM WAT

---

## 16. Open Questions (Resolve in Onboarding Week, 24–29 June)

1. **BVN/KYC requirement for VA provisioning** — does creating a VA for a member require BVN? This affects the onboarding UX.
2. **Production VA limit per user** — sandbox allows 2. What's the production limit?
3. **bankCode format** — what format does the Transfers API expect? (NIBSS code?)
4. **VA suspend endpoint** — confirm `PUT /v1/accounts/suspend/{providerAccountRef}` is correct
5. **Boilerplate timing** — can repo scaffold predate 1 July? Confirm with mentors.
6. **Payout to bank account** — recipient's payout goes to their registered bank account (from Nomba profile or from the VA bankAccountNumber). Which is the right destination?

---

## 17. Demo Script (~2 minutes)

1. Show a circle: 5 members, ₦10,000/week, rotation visible (positions 1–5)
2. Split screen: member bank app (left) → live dashboard (right)
3. Members transfer → dashboard marks each "paid" in real time; pot fills ₦10k → ₦20k → … → ₦50k
4. One member overpays (₦12k) → "₦2,000 carried to next cycle". Another sends ₦6k → ₦4k (two transfers, running total)
5. Final contribution lands → **auto-payout of ₦50,000 to recipient via Nomba Transfer** → rotation advances
6. Close: shared ledger, per-member history, "you're next" for upcoming recipient

---

## 18. Architecture + Security Note (Write on Day 7)

Cover these points:

- **Auth:** BetterAuth (email+password). User app and admin app have separate BetterAuth instances on the same DB. Protected routes check session server-side.
- **Webhooks:** Raw body capture → HmacSHA256 signature verification (timing-safe) → `WebhookReceipt @@unique([provider, providerEventId])` idempotency guard → business logic only after all three pass. Always returns 200 even on duplicates (Nomba retries on non-200).
- **Payout safety:** `Payout.cycleId @unique` (DB constraint) + `SELECT FOR UPDATE` (row lock, prevents concurrent double-trigger) + `merchantTxRef = payout_{cycleId}` (Nomba-side idempotency). Three independent layers.
- **Money:** All amounts stored as `Int` in kobo. Never `Float`. Conversion only at Nomba API boundary (`naira = minor / 100`). Totals always recalculated server-side.
- **Data:** No PII in logs. Nomba credentials stored encrypted in `NombaConfig`. Webhook payloads stored encrypted at rest in production.
- **Reconciliation:** Append-only `InboundTransfer` records. Funds never dropped — unmatched credits go to buffer with UNMATCHED status. Full audit trail from raw webhook to payout.

---

## 19. Environment Variables

```
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

ADMIN_BETTER_AUTH_SECRET=
ADMIN_BETTER_AUTH_URL=

NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=
NOMBA_SUB_ACCOUNT_ID=
NOMBA_SIGNATURE_KEY=
NOMBA_BASE_URL=https://api.nomba.com

RESEND_API_KEY=
```

---

## 20. Pre-Build Checklist (Before Day 1)

- [ ] Hackathon registration confirmed (deadline 23 June)
- [ ] Nomba sandbox credentials in hand (from onboarding week)
- [ ] Open questions in §16 answered in office hours
- [ ] Disk space freed (minimum 5 GB recommended for Next.js + Prisma + pnpm)
- [ ] Node.js 20+, pnpm 9+, Vercel CLI installed
- [ ] Neon database created and `DATABASE_URL` ready
