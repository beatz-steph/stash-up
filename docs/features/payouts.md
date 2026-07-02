# Payouts Feature

The Payout Engine distributes collected funds to the member whose turn it is to receive the pot.

## Core Concepts

- **Pot Size**: Expected amount is `contributionMinor * activeMembers`. Suspended members do not contribute, reducing the pot.
- **Idempotency**: Payouts are guarded by a Redis lock (`payout:lock:<cycleId>`) and use a deterministic `merchantTxRef` (`payout_<cycleId>`).
- **Nomba Integration**: Payouts map to Nomba's Sub-Account Bank Transfer API.

## State Machine
1. `READY_TO_PAYOUT`: Cron or user can trigger the payout.
2. `PAYOUT_INITIATED`: Request sent to Nomba. We wait for a webhook to confirm success or failure.
3. `PAID_OUT`: Funds successfully distributed. Rotation advances.

## Flow
1. **Initiation**: The system locks the cycle, writes a `Payout` record in an `INITIATED` state, flips the Cycle to `PAYOUT_INITIATED`, and makes an API call to Nomba.
2. **Result Webhook**: Nomba sends `payout_success` or `payout_failed` (matched via `merchantTxRef`).
3. **Success**: Mark Payout `SUCCESS`, Cycle `PAID_OUT`. Advance rotation to the next member.
4. **Failure**: Mark Payout `FAILED`. The Cycle remains at `PAYOUT_INITIATED` (requiring admin intervention / retry in Sprint 8).

## Cron Sweep
The cron job `GET /api/cron/payout-sweep` runs hourly and processes all cycles in `READY_TO_PAYOUT` state.
