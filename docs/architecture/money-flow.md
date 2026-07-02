# Money Flow

Members pay into a Virtual Account (VA) assigned during circle activation. The webhook triggers reconciliation which matches the transfer to an active Cycle. Once the pot is full, a Payout is automatically triggered or manually triggered.

## Inbound (Collection)
1. User transfers funds via bank transfer to their unique Nomba Virtual Account.
2. Nomba fires a `transfer_success` webhook.
3. The StashUp Webhook Dispatcher uses Redis to acquire a lock and idempotent DB logic to deduplicate the event.
4. The system updates the VA's `balanceMinor` and invokes the Reconciliation Engine.
5. The Reconciliation Engine applies the funds to pending Contributions for the active cycle, marking them `COMPLETE`. If all contributions are complete, the cycle status becomes `READY_TO_PAYOUT`.

## Outbound (Payout)
1. A cron job `payout-sweep` runs hourly and picks up cycles in `READY_TO_PAYOUT`. Alternatively, the circle creator can manually click "Trigger Payout".
2. The Payout Engine (Phase 1) locks the cycle, creates a `Payout` record with an `INITIATED` status, generates a `merchantTxRef` as `payout_<cycleId>`, and flips the cycle to `PAYOUT_INITIATED`.
3. The Payout Engine (Phase 2) hits the Nomba Sub-Account Bank Transfer API. 
4. Nomba processes the transfer and fires a `payout_success` or `payout_failed` webhook.
5. On `payout_success`, the `Payout` is marked `SUCCESS` and the `Cycle` becomes `PAID_OUT`. The system advances rotation (creates the next cycle).
6. On `payout_failed`, the `Payout` is marked `FAILED` but the cycle remains in `PAYOUT_INITIATED` requiring admin remediation (Sprint 8).
