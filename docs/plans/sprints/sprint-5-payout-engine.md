# Sprint 5 — Payout Engine (money-out)

**Goal:** when a cycle is `READY_TO_PAYOUT`, pay the recipient's withdrawal account via Nomba,
with the non-negotiable 3-layer double-payout guard, then advance the rotation. The most
dangerous code in the system — idempotency is mandatory and tested.

**Prerequisites:** Sprints 1 (transfer client) + 4 (cycle reaches READY_TO_PAYOUT).
**Blocks:** Sprint 6 (dashboard shows payout state), Sprint 8 (retry).

> Models: `Payout` (`cycleId @unique`, `merchantTxRef @unique`, `status: INITIATED|
> PENDING_BILLING|SUCCESS|FAILED|REFUNDED`), `Cycle.status (PAYOUT_INITIATED|PAID_OUT)`,
> `WithdrawalAccount`, `Membership.payoutPosition`, `Circle.currentCycleSeq`.

---

## A. Payout initiation (`app/api/circles/[id]/cycles/[cycleId]/payout` or webhook/cron-driven)
The 3 layers (CLAUDE.md "Payout Safety"):
1. **DB constraint:** `Payout.cycleId @unique` — one payout per cycle, ever.
2. **Lock + status check in `$transaction`:** `acquirePayoutLock(cycleId)` (Redis) AND read the
   cycle `FOR UPDATE`-style inside the transaction; abort if not `READY_TO_PAYOUT` or already
   `PAYOUT_INITIATED`.
3. **Idempotency key:** `merchantTxRef = "payout_{cycleId}"` sent to Nomba so a retried transfer
   is a no-op on their side.

Flow: resolve recipient `Membership` → their `WithdrawalAccount` (must exist; else block +
flag); create `Payout(INITIATED)`; set cycle `PAYOUT_INITIATED`; call
`initiateSubAccountBankTransfer` with `merchantTxRef`; persist `nombaTransferId`/`nombaStatus`.

## B. Payout result (via webhook dispatch — extends Sprint 1/4)
On payout-result event (verify exact Nomba event name):
- success → `Payout.SUCCESS`, `Cycle.PAID_OUT` (+ `paidOutAt`), notify recipient; then
  **advance rotation**: if more positions remain → open next `Cycle` (`sequence+1`, next
  recipient by `payoutPosition`, carry buffers), `currentCycleSeq++`; else `Circle.COMPLETED`.
- failure → `Payout.FAILED` + `failureReason`; cycle back to `READY_TO_PAYOUT` (or a
  needs-attention state); leave for admin retry (Sprint 8). Notify.

Keep "what happens next" (advance vs complete, next recipient, buffer carry) in a pure,
tested function.

## C. Trigger
Automatic is ideal: a cron/worker scans `READY_TO_PAYOUT` cycles and initiates payout (so it's
hands-off). Document the trigger. An admin-invokable initiate is acceptable as backup.

## D. Frontend (tested)
- Circle detail: "It's @user's turn", payout status (initiated/sent/failed), payout history per
  cycle, amount in ₦. Recipient sees a payout-received state.

## E. TDD / tests (money-critical — required)
- **Idempotency:** two concurrent initiations → exactly one `Payout` (unique violation handled);
  re-initiate after INITIATED → no second transfer; lock prevents double-send.
- **Guard:** cycle not READY_TO_PAYOUT → refused; recipient without WithdrawalAccount → blocked.
- **Result handling:** success → PAID_OUT + next cycle opens with correct recipient; last cycle
  → COMPLETED; failure → FAILED + reason, no rotation.
- **Rotation/buffer** pure-function tests.
- **Frontend:** turn indicator + payout states render.

## F. Documentation
- `docs/features/payouts.md` — the 3 layers, the state machine, rotation, failure handling.
- `docs/runbooks/payout-retry.md` — diagnosing a FAILED payout, safe retry via `merchantTxRef`.
- `docs/architecture/money-flow.md` — close the loop (pot → recipient bank).

## G. Acceptance criteria
- [ ] A completed pot pays the right recipient exactly once; all 3 idempotency layers present
      and tested.
- [ ] Rotation advances correctly; circle completes after the last position.
- [ ] Failures are recoverable (status + reason), never double-pay. Docs + typecheck/lint/tests
      green.

## H. Out of scope
Admin retry UI (Sprint 8). Refund flows beyond setting `REFUNDED` status.
