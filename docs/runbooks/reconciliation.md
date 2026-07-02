# Reconciliation Runbook

Reconciliation is the process of matching incoming funds to expected contributions within a circle cycle.

## Flow
1. **Webhook Reception**: Nomba sends a webhook to `/api/webhooks/nomba` when a transfer is made to a member's Virtual Account.
2. **Deduplication**: The webhook is deduplicated using a Redis lock (falling back to DB deduplication if Redis is unavailable).
3. **Signature Verification**: The webhook signature is verified using the `NOMBA_SIGNATURE_KEY`.
4. **Matching**: The system attempts to match the transfer to a specific member and cycle.
   - The virtual account's `accountRef` identifies the member.
   - The active cycle for the member's circle is identified.
5. **Receipt Creation**: A `Receipt` record is created, logging the payment against the member's expected contribution for the cycle.
6. **Cycle State Transition**: If the total collected receipts for the cycle meet or exceed the expected pot size, the cycle transitions to `READY_TO_PAYOUT`.

## Troubleshooting

### Unmatched Webhooks
Webhooks that cannot be matched to a member (e.g., if the VA is missing or the circle was cancelled) are logged but do not create a receipt. Check the Admin Dashboard's Webhooks tab for failures.

### Cycle Not Transitioning
If a cycle has received all funds but hasn't transitioned to `READY_TO_PAYOUT`:
- Verify that the sum of all successful `Receipt` amounts matches the cycle's `potExpectedMinor`.
- Ensure no receipts were marked as failed or rolled back.

### Redis Downtime
If Redis is unavailable, the system degrades to DB-based deduplication using `Prisma` unique constraints on the webhook ID. This ensures correctness but may be slightly slower under high concurrency.
