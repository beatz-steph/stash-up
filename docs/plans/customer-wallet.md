# Customer Wallet — Implementation Plan

A per-customer wallet: a spendable balance each user owns across circles. Money
can flow **in** (bank top-up, card top-up, end-of-circle buffer, the ₦50
verification credit), be **spent** (auto-debited for a circle's next cycle
before falling back to a saved card), and flow **out** (withdrawn to the user's
bank `WithdrawalAccount`). Written to be executed by an LLM agent with no prior
context. **Read `CLAUDE.md` first** — API-route pattern, money-in-kobo,
`tx: Prisma.TransactionClient` typing, and the gate
(`pnpm --filter web typecheck && pnpm --filter web lint &&
pnpm --filter web test && pnpm --filter admin typecheck`) are non-negotiable.

## Why this fits (and what it fixes)

The app is **already a ledger**: all real naira pools in the single Nomba
sub-account; circle `potCollectedMinor` and `Membership.bufferMinor` are DB
numbers accounting for who owns what slice of that pool. Payouts move real money
out of the sub-account while decrementing the ledger. **A wallet is one more
ledger bucket per user** — not a new payment rail.

It removes three existing pain points:
1. **Stranded end-of-circle buffer.** Today `bufferMinor` auto-applies to the
   next cycle *within a circle*; on the LAST cycle the remainder has nowhere to
   go. → sweep it to the wallet.
2. **The broken refund API.** Nomba's `/checkout/refund` rejects real settled
   charges in this environment (see card plan). → the ₦50 verification hold is
   **credited to the wallet as store credit** instead of refunded to source.
3. **Card-charge fragility.** A wallet debit is an internal ledger move —
   instant, free, cannot fail. → spend wallet *before* the card.

## Decisions (locked 2026-07-04)

- **Backing model: internal ledger over the shared sub-account + a dedicated
  per-user Nomba VA for bank top-ups**, provisioned **lazily** (first time the
  user needs it). The wallet *balance* is a DB number; the dedicated VA only
  gives top-ups a bank account number to send to. (NOT a native Nomba
  sub-account per user.)
- **₦50 verification → wallet credit** (source `REFUND_CREDIT`), replacing the
  card refund. Disclosed in UI copy ("added to your StashUp wallet"). The old
  refund path is retired for verification; `refundStatus` stays only for any
  future true-refund need.
- **Spend order (waterfall): wallet first, then saved card.** The sweep debits
  the wallet up to the live `remainingDue`, then charges the bound card for any
  remainder.

## Money model & the reconciliation identity

Real sub-account balance must always cover every ledger claim:

```
subAccountAvailable  ≥  Σ(open-cycle pot balances not yet paid out)
                      +  Σ(Membership.bufferMinor)
                      +  Σ(WalletAccount.balanceMinor)
```

Adding wallets adds the third term. The admin overview gains a **wallet
liabilities** line, and reconciliation treats `Σ wallet balances` as money we
owe users. Every wallet mutation is an **append-only `WalletLedgerEntry`**
(audit + idempotency); `WalletAccount.balanceMinor` is the running total and is
only ever changed in the same `$transaction` that writes the ledger entry.

## Schema (`packages/db/prisma/business.prisma`)

```prisma
enum VAKind {
  CIRCLE   // per-membership VA — transfers match a cycle contribution
  WALLET   // per-user VA — transfers credit the wallet balance
}

enum WalletEntryDirection { CREDIT DEBIT }

enum WalletEntrySource {
  TOPUP_BANK      // inbound transfer to the wallet VA
  TOPUP_CARD      // tokenized card / checkout top-up
  BUFFER_SWEEP    // leftover circle buffer at circle completion
  REFUND_CREDIT   // ₦50 verification hold converted to store credit
  CIRCLE_DEBIT    // spent on a cycle contribution (waterfall)
  WITHDRAWAL      // paid out to the bank
  REVERSAL        // failed withdrawal credited back
  ADJUSTMENT      // admin correction (audited)
}

enum WalletWithdrawalStatus { INITIATED SUCCESS FAILED }

model WalletAccount {
  id               String   @id @default(cuid())
  userId           String   @unique
  user             User     @relation(fields: [userId], references: [id])
  balanceMinor     Int      @default(0)   // ledger; real naira pooled in the sub-account
  // Dedicated per-user Nomba VA for bank top-ups (lazy — null until provisioned).
  virtualAccountId String?  @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  entries     WalletLedgerEntry[]
  withdrawals WalletWithdrawal[]
}

model WalletLedgerEntry {
  id                String               @id @default(cuid())
  walletId          String
  wallet            WalletAccount        @relation(fields: [walletId], references: [id])
  direction         WalletEntryDirection
  amountMinor       Int                  // always positive; direction gives the sign
  balanceAfterMinor Int                  // wallet balance immediately after this entry
  source            WalletEntrySource
  // What produced it: circleId/cycleId/inboundTransferId/withdrawalId/chargeAttemptId.
  reference         String?
  // Deterministic dedup key so a replayed webhook/sweep never double-posts, e.g.
  // "topup_{inboundTransferId}", "buffer_{cycleId}_{membershipId}",
  // "verify_{chargeAttemptId}", "cd_{cycleId}_{membershipId}_a{n}",
  // "wd_{withdrawalId}", "rev_{withdrawalId}".
  idempotencyKey    String               @unique
  createdAt         DateTime             @default(now())

  @@index([walletId, createdAt])
  @@index([source])
}

model WalletWithdrawal {
  id             String                 @id @default(cuid())
  walletId       String
  wallet         WalletAccount          @relation(fields: [walletId], references: [id])
  amountMinor    Int
  // 3-layer payout safety (mirrors Payout): unique idempotency key to Nomba.
  merchantTxRef  String                 @unique   // "walletwd_{id}"
  status         WalletWithdrawalStatus @default(INITIATED)
  nombaTransferId String?
  failureReason  String?
  // Snapshot of the destination bank at request time (WithdrawalAccount can change).
  bankCode       String
  bankName       String
  accountNumber  String
  accountName    String
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt

  @@index([walletId, createdAt])
  @@index([status])
}
```

Plus on `VirtualAccount` (make it usable for wallets):

```prisma
  kind         VAKind  @default(CIRCLE)
  membershipId String? @unique      // null for WALLET VAs
  userId       String?              // set for WALLET VAs (owner)
  // add @@index([userId])
```

`User` gains back-relations: `wallet WalletAccount?`. Migration name:
`customer_wallet`.

> **Note on `VirtualAccount.membershipId`:** it is currently required + unique.
> Making it nullable is a safe widening (existing CIRCLE rows keep their value).
> The webhook must branch on `kind` BEFORE the existing membership lookup.

## Core invariants (money-critical — qa-engineer reviews these)

1. **Every balance change is atomic with its ledger entry.** Read the
   `WalletAccount` row `FOR UPDATE` (inside `$transaction`), compute, write the
   `WalletLedgerEntry`, set `balanceMinor` — all in one tx. Never mutate
   `balanceMinor` without an entry.
2. **Idempotency via `WalletLedgerEntry.idempotencyKey @unique`.** A replayed
   webhook or overlapping sweep hits the unique and no-ops (catch P2002 → stop).
3. **No overdraw.** Debits assert `balanceMinor >= amount` inside the tx; abort
   otherwise. Spend waterfall caps the debit at `min(remainingDue, balance)`.
4. **Withdrawal = 3-layer payout safety** (mirrors circle `Payout`):
   `merchantTxRef @unique` DB guard; read-status-inside-tx guard; deterministic
   `merchantTxRef = "walletwd_{id}"` sent to Nomba as idempotency key.
5. **Debit-before-send with reversal.** Withdrawal debits the ledger in the tx,
   THEN calls Nomba. If the Nomba call throws synchronously → REVERSAL entry
   (credit back) + mark FAILED. If it accepts → the `payout_failed` webhook
   later triggers the REVERSAL. `payout_success` confirms.

## Flows

### A. Lazy wallet provisioning
`ensureWallet(userId)` (shared backend lib): upsert `WalletAccount`; if it has
no `virtualAccountId` and we need one (first bank top-up view / first credit
that should be withdrawable), call the existing `createVirtualAccount`
(`accountRef = "wallet_{userId}"`, name sanitized like the circle VAs) and
store the VA with `kind: WALLET, userId`. Idempotent.

### B. Top-up
- **Bank:** show the wallet VA's account number (`GET /api/wallet`). A transfer
  in fires `payment_success` on a `kind: WALLET` VA → credit `TOPUP_BANK`.
- **Card:** `POST /api/wallet/topup` `{ amountMinor }` → a tokenized/checkout
  order tagged `orderMetaData.kind = "wallettopup"` (reuses `createCheckoutOrder`
  / the existing card rails). Settlement → credit `TOPUP_CARD`.

### C. Buffer → wallet on circle completion
In `advanceRotation` (rotation.ts, where the circle is marked `COMPLETED`), for
each membership with `bufferMinor > 0`: within the same tx, credit the wallet
(`BUFFER_SWEEP`, `idempotencyKey = "buffer_{cycleId}_{membershipId}"`,
`ensureWallet` first) and zero `bufferMinor`. Notify the member.

### D. ₦50 verification → wallet credit (replaces the refund)
In `card-settlement.ts` `settleVerification`: after creating the SavedCard,
instead of calling `refundCheckoutTransaction`, credit the wallet
(`REFUND_CREDIT`, `idempotencyKey = "verify_{chargeAttemptId}"`) and set the
attempt `refundStatus = REFUNDED` / `refundedAt`. UI copy: "The ₦50 verification
charge has been added to your StashUp wallet." The Stage-4 refund-retry pass
becomes a no-op for verification (no FAILED refunds to chase).

### E. Spend waterfall (in the card debit sweep)
Before charging the card, in `POST /api/cron/card-debit-sweep` pass 1:
1. compute `remainingDue` (unchanged).
2. **Wallet first:** in a tx, lock the wallet row; `debit = min(remainingDue,
   balance)`; if `> 0`: DEBIT `CIRCLE_DEBIT`
   (`idempotencyKey = "cd_{cycleId}_{membershipId}_a{n}"`), create an
   `InboundTransfer{ source: "WALLET" }` (feed + idempotency), and
   `applyContributionSplit`. Recompute `remainingDue`.
3. **Card for the remainder:** if `remainingDue > 0` and a card is bound, the
   existing card-charge path runs for exactly that remainder.
A member with enough wallet balance is fully collected with zero Nomba calls.

### F. Withdrawal to bank
`POST /api/wallet/withdraw` `{ amountMinor }`. Guards: verified email; a
`WithdrawalAccount` exists; `amountMinor > 0`. In `$transaction`: lock wallet
`FOR UPDATE`, assert balance ≥ amount, create `WalletWithdrawal(INITIATED)` with
a snapshot of the `WithdrawalAccount`, DEBIT `WITHDRAWAL`
(`idempotencyKey = "wd_{id}"`), decrement balance. Then call
`initiateSubAccountBankTransfer({ ..., merchantTxRef: "walletwd_{id}" })`. On
synchronous throw → REVERSAL + FAILED. Webhook `payout_success` →
`WalletWithdrawal SUCCESS`; `payout_failed` → REVERSAL credit + FAILED + notify.

### G. Webhook routing (dispatch.ts / card-settlement.ts)
- `payment_success` on a `kind: WALLET` VA → `TOPUP_BANK` credit (branch before
  the CIRCLE contribution matcher, keyed on `virtualAccount.kind`).
- `payment_success` card with `orderMetaData.kind = "wallettopup"` →
  `TOPUP_CARD` credit (new branch in `handleCardSettlement`).
- `payout_success` / `payout_failed` with `merchantTxRef` starting `walletwd_`
  → resolve a `WalletWithdrawal` (the existing payout branches currently assume
  a circle `Payout`; branch on the ref prefix first).

## Reconciliation / admin
- Admin overview: add **Wallet liabilities** = `Σ WalletAccount.balanceMinor`,
  and fold it into the recon identity check against the sub-account balance.
- Admin wallet view (v2): per-user balance + ledger; an `ADJUSTMENT` entry type
  exists for audited corrections.

## Nomba specifics (reuse existing client)
- `createVirtualAccount` — wallet VA (already implemented).
- `initiateSubAccountBankTransfer` — wallet withdrawal (already implemented;
  idempotent via `merchantTxRef`).
- `createCheckoutOrder` / tokenized rails — card top-up (already implemented).
- No new Nomba endpoints required.

## Implementation stages (each = one commit, gate green)

### Stage 1 — Schema + wallet ledger core
- Migration `customer_wallet`; regenerate client.
- `lib/wallet/ledger.ts` (shared, `import "server-only"`): `ensureWallet(tx,
  userId)`, `creditWallet(tx, { userId, amountMinor, source, reference,
  idempotencyKey })`, `debitWallet(tx, { userId, amountMinor, source,
  reference, idempotencyKey })` — all enforcing invariants 1–3 (lock, ledger
  entry, balance update, overdraw guard, P2002 idempotency no-op).
- Pure/unit tests for credit/debit/overdraw/idempotency. NO behavior wired yet.

### Stage 2 — Read API + provisioning + Settings UI
- `GET /api/wallet` (balance + VA number if provisioned + recent ledger),
  `lib/api/data/wallet/*`, `features/wallet/*` (React Query).
- Lazy `ensureWalletVirtualAccount` on first bank-top-up view.
- Settings "Wallet" card: balance, top-up (bank number + card), withdraw button.

### Stage 3 — Top-ups (bank VA + card) + webhook routing
- `VirtualAccount.kind == WALLET` branch in dispatch → `TOPUP_BANK`.
- `POST /api/wallet/topup` (card) + `wallettopup` settlement branch →
  `TOPUP_CARD`.
- Tests: wallet-VA credit routes to ledger (not the contribution matcher);
  card top-up credits on settlement; both idempotent.

### Stage 4 — Buffer→wallet + ₦50→wallet
- `advanceRotation`: sweep `bufferMinor` → wallet (`BUFFER_SWEEP`) at COMPLETED.
- `settleVerification`: credit `REFUND_CREDIT` instead of refunding; update copy.
- Tests: completion sweeps buffers exactly once; verification credits the wallet
  and no longer calls the refund API.

### Stage 5 — Spend waterfall + withdrawal (money-out; qa-engineer pass)
- Sweep pass 1: wallet-debit before card (flow E), fully tested against THE CORE
  RULE (wallet covers part → card charges only the rest; wallet covers all →
  no card call).
- `POST /api/wallet/withdraw` (flow F) + `payout_*` `walletwd_` branch (flow G)
  + REVERSAL on failure. 3-layer safety + overdraw + idempotency tests.
- Admin overview: wallet-liabilities line + recon identity.

## Open questions
1. **Minimum withdrawal / fees?** Does Nomba charge a transfer fee on payouts we
   should surface or absorb? (Circle payouts already pay it — confirm parity.)
2. **Wallet VA name collision.** Nomba rejected hyphens/odd chars on VA names
   before — reuse the existing sanitizer for `"StashUp Wallet {name}"`.
3. **Withdraw-all vs partial** — allow arbitrary amounts (default) or only
   full-balance withdrawal for v1?
4. **KYC/limits** — any per-user wallet balance or withdrawal cap for the
   hackathon build? (Assume none unless specified.)
```
