# Runbook: Payout Retry

## Context
A Payout transfers the collected pot for a cycle to the member whose turn it is. 
Failures can happen due to API timeouts, insufficient Nomba master balance, or invalid recipient account details.

## Symptoms
- Cycle stuck in `PAYOUT_INITIATED` state indefinitely.
- `Payout` record has `status = "FAILED"` or `nombaStatus = "UNKNOWN"`.

## Resolution Steps

### 1. Identify the Failure Reason
Find the failed payout:
```sql
SELECT p.id, p.merchantTxRef, p.status, p.nombaStatus, p.failureReason
FROM "Payout" p
WHERE p.cycleId = '<cycle-id>';
```

### 2. Verify with Nomba Dashboard
- If `nombaStatus` is `UNKNOWN`, log into the Nomba dashboard.
- Search for the `merchantTxRef` (e.g. `payout_<cycleId>`).
- If the transfer succeeded in Nomba, do NOT retry. The webhook was dropped.

### 3. Handle Dropped Webhook (Nomba Succeeded)
Manually force the status:
```typescript
await prisma.payout.update({
  where: { merchantTxRef },
  data: { status: 'SUCCESS' }
});
await prisma.cycle.update({
  where: { id: cycleId },
  data: { status: 'PAID_OUT' }
});
// Advance rotation manually
```

### 4. Handle True Failure (Nomba Failed/Rejected)
If Nomba rejected the transfer:
1. Fix the underlying issue (e.g. ask the user to update their withdrawal bank details, or top up the Nomba master balance).
2. Since `merchantTxRef` must be unique per cycle (`payout_<cycleId>`), you cannot simply hit the initiate API again with the same ref.
3. *Note on Admin UI (Sprint 8):* The "Retry Request" button in the admin interface **records intent only**. It writes an audit log (`PAYOUT_RETRY_REQUESTED`) so operators can track which payouts need attention. It does **not** automatically re-send the payout to Nomba or create a new `Payout` database row.
4. Engineering must manually intervene to execute the retry by generating a new `merchantTxRef` (e.g., `payout_<cycleId>_r1`), updating the `Payout` record, and re-invoking the engine. Automated retry functionality will be built in a future sprint.
