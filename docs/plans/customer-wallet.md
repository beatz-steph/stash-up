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
- **Fees are ALWAYS surfaced to the user — the business absorbs nothing.**
  Applies to wallet withdrawals, circle payouts, and card payments. See "Fee
  policy" below.
- **Withdrawals: arbitrary amounts, no caps, and require a transaction PIN**
  (4–6 digits, hashed, attempt-limited with lockout — mirrors the
  `WithdrawalAccountOtp` hardening pattern).

## Fee policy (locked — surface, never absorb)

Observed ground truth: the live ₦50 card settlement carried
`data.transaction.fee: 0.7` → **1.4% card fee**. Nomba transfer (payout) fees
are tiered flat amounts. Config lives in `apps/web/lib/fees.ts` — constants
overridable by env so real values can be corrected without a deploy:

```ts
CARD_FEE_RATE = 0.014                       // observed 2026-07-04; env NOMBA_CARD_FEE_RATE
transferFeeMinor(amountMinor)               // tiered flat fee; env NOMBA_TRANSFER_FEE_* overrides
grossUpForCardFee(netMinor)                 // ceil(net / (1 − rate)) so net-after-fee ≥ intended
```

Per flow:
- **Card contribution / enrollment charges:** charge
  `grossUpForCardFee(remainingDue)` so the pot still receives the full
  contribution net of Nomba's cut; the fee delta is shown in the UI before
  checkout ("₦X + ₦Y card fee") and the actual fee from the settlement webhook
  (`transaction.fee`) is recorded (`feeMinor` on ChargeAttempt +
  InboundTransfer) and displayed in feeds.
- **Card wallet top-up:** same gross-up — user pays `amount + fee`, wallet is
  credited the intended `amount`; fee disclosed pre-checkout and in the ledger.
- **Bank-transfer top-ups / VA contributions:** sender pays their own bank's
  transfer fee; Nomba inbound VA credits carry no observed fee — nothing to
  surface (re-check if a fee field ever appears on `vact_transfer` webhooks).
- **Wallet withdrawal:** user asks for `amount`; wallet is debited
  `amount + transferFeeMinor(amount)`; the fee is shown on the confirm screen
  and stored on `WalletWithdrawal.feeMinor`.
- **Circle payout:** amount sent to the recipient becomes
  `pot − transferFeeMinor(pot)`; `Payout.feeMinor` records it and the payout UI
  + email show "Payout ₦X (₦Y transfer fee)". (Small retrofit to the existing
  payout initiation — its own stage below.)

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
  amountMinor    Int                    // what the user receives
  feeMinor       Int                    @default(0)   // surfaced transfer fee; wallet debited amount + fee
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

// Transaction PIN gating wallet withdrawals. Same hardening pattern as
// WithdrawalAccountOtp: only a hash stored, failed attempts counted, lockout.
model WalletPin {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  pinHash     String    // scrypt(pin, salt) — NEVER the plaintext; sha256 is too fast for a 4-6 digit space
  salt        String
  attempts    Int       @default(0)    // consecutive failures; reset on success
  lockedUntil DateTime?                // set after MAX_PIN_ATTEMPTS (5) failures — 15 min lock
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

Fee-surfacing columns added in the same migration:
- `Payout.feeMinor Int @default(0)` — circle payout transfer fee.
- `ChargeAttempt.feeMinor Int @default(0)` — actual card fee from the
  settlement webhook (`transaction.fee`).
- `InboundTransfer.feeMinor Int @default(0)` — same, for feed display.

Plus on `VirtualAccount` (make it usable for wallets):

```prisma
  kind         VAKind  @default(CIRCLE)
  membershipId String? @unique      // null for WALLET VAs
  userId       String?              // set for WALLET VAs (owner)
  // add @@index([userId])
```

`User` gains back-relations: `wallet WalletAccount?`, `walletPin WalletPin?`.
Migration name: `customer_wallet`.

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

### F. Withdrawal to bank (PIN-gated, fee-surfaced)
`POST /api/wallet/withdraw` `{ amountMinor, pin }`. Guards: verified email; a
`WithdrawalAccount` exists; `amountMinor > 0` (arbitrary amounts, no cap); a
`WalletPin` is set and `pin` verifies (scrypt compare; on failure increment
`attempts`, lock 15 min after 5 — mirror the OTP lockout; NEVER log the pin).
Fee: `feeMinor = transferFeeMinor(amountMinor)`, shown on the confirm screen
(`GET /api/wallet` returns a fee quote helper or the UI computes via a
`/api/wallet/withdraw/quote` — implementer's call, keep it typed).
In `$transaction`: lock wallet `FOR UPDATE`, assert balance ≥ amount + fee,
create `WalletWithdrawal(INITIATED, feeMinor)` with a snapshot of the
`WithdrawalAccount`, DEBIT `WITHDRAWAL` for `amount + fee`
(`idempotencyKey = "wd_{id}"`), decrement balance. Then call
`initiateSubAccountBankTransfer({ amount, ..., merchantTxRef: "walletwd_{id}" })`.
On synchronous throw → REVERSAL (credit back `amount + fee`) + FAILED. Webhook
`payout_success` → `WalletWithdrawal SUCCESS`; `payout_failed` → REVERSAL
credit + FAILED + notify.

### F2. PIN management
- `POST /api/wallet/pin` `{ pin }` — first-time set: session + verified email
  only. `pin` must be 4–6 digits.
- `PUT /api/wallet/pin` `{ currentPin, newPin }` — change requires the current
  PIN (locked-out users must wait out the lockout).
- Hashing: `crypto.scryptSync(pin, salt, 64)` (node built-in — deliberately slow
  for the tiny 4–6 digit space; sha256 is NOT acceptable here), random 16-byte
  salt per user, timing-safe compare.
- Forgot-PIN reset (email OTP) is v2; for now support is manual.

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

### Stage 1 — Schema + wallet ledger core + fee config
- Migration `customer_wallet` (all wallet models, `WalletPin`, `VAKind`,
  `feeMinor` columns on Payout/ChargeAttempt/InboundTransfer); regenerate.
- `lib/wallet/ledger.ts` (shared, `import "server-only"`): `ensureWallet(tx,
  userId)`, `creditWallet(tx, { userId, amountMinor, source, reference,
  idempotencyKey })`, `debitWallet(tx, { userId, amountMinor, source,
  reference, idempotencyKey })` — all enforcing invariants 1–3 (lock, ledger
  entry, balance update, overdraw guard, P2002 idempotency no-op).
- `lib/fees.ts`: `CARD_FEE_RATE`, `transferFeeMinor`, `grossUpForCardFee`
  (env-overridable), unit-tested.
- Pure/unit tests for credit/debit/overdraw/idempotency + fee math. NO
  behavior wired yet.

### Stage 2 — Read API + provisioning + Settings UI
- `GET /api/wallet` (balance + VA number if provisioned + recent ledger),
  `lib/api/data/wallet/*`, `features/wallet/*` (React Query).
- Lazy `ensureWalletVirtualAccount` on first bank-top-up view (reuse the
  existing VA name sanitizer — Nomba rejects punctuation).
- Settings "Wallet" card: balance, top-up (bank number + card), withdraw button.

### Stage 3 — Top-ups (bank VA + card) + webhook routing
- `VirtualAccount.kind == WALLET` branch in dispatch → `TOPUP_BANK`.
- `POST /api/wallet/topup` (card, grossed-up; fee disclosed pre-checkout) +
  `wallettopup` settlement branch → `TOPUP_CARD` credit of the intended amount;
  record actual `feeMinor` from the webhook.
- Tests: wallet-VA credit routes to ledger (not the contribution matcher);
  card top-up credits on settlement; both idempotent.

### Stage 4 — Buffer→wallet + ₦50→wallet
- `advanceRotation`: sweep `bufferMinor` → wallet (`BUFFER_SWEEP`) at COMPLETED.
- `settleVerification`: credit `REFUND_CREDIT` instead of refunding; update copy.
- Tests: completion sweeps buffers exactly once; verification credits the wallet
  and no longer calls the refund API.

### Stage 5 — Spend waterfall + PIN + withdrawal (money-out; qa-engineer pass)
- Sweep pass 1: wallet-debit before card (flow E), fully tested against THE CORE
  RULE (wallet covers part → card charges only the rest; wallet covers all →
  no card call). Card remainder charges use `grossUpForCardFee`.
- PIN endpoints (flow F2) + `POST /api/wallet/withdraw` (flow F, PIN-gated,
  fee-surfaced) + `payout_*` `walletwd_` branch (flow G) + REVERSAL on failure.
- Tests: 3-layer safety, overdraw, idempotency, PIN lockout after 5 failures,
  fee debited and recorded.
- Admin overview: wallet-liabilities line + recon identity.

### Stage 6 — Circle payout fee surfacing (retrofit)
- Payout initiation: send `pot − transferFeeMinor(pot)`, store `Payout.feeMinor`.
- Card contribution charges (enroll + sweep): gross-up via `grossUpForCardFee`;
  record actual `feeMinor` from settlements onto ChargeAttempt/InboundTransfer.
- UI + payout email show the fee line. Update existing payout tests.

## Resolved questions (2026-07-04)
1. **Fees:** surfaced everywhere, business absorbs nothing — see Fee policy.
2. **Withdrawals:** arbitrary amounts, no caps.
3. **Security:** transaction PIN required for withdrawals (scrypt, lockout).
4. **VA naming:** reuse the existing sanitizer for `"StashUp Wallet {name}"`.
```
