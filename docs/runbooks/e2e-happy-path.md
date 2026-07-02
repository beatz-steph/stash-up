# E2E Happy Path (Manual Runbook)

This runbook documents the complete end-to-end flow for testing the StashUp platform in the Nomba sandbox. It proves the platform works from user registration through to payouts.

## Prerequisites
- Both `apps/web` (port 3000) and `apps/admin` (port 3001) are running.
- A Nomba Sandbox Webhook is configured to point to your local instance (via ngrok) or deployed instance at `/api/webhooks/nomba`.
- You have two email addresses you can test with (or use dummy emails if email verification is mocked/disabled in local).

## 1. User Registration & Onboarding
1. **Sign Up**: Navigate to the web app (`http://localhost:3000/auth/sign-up`). Create an account for User A (the Creator).
2. **Verify Email**: Complete the email verification step (click link in email or check DB for the token).
3. **Withdrawal Account**: Add a withdrawal account using the onboarding flow. 
4. **Repeat**: Repeat steps 1-3 to create a second account for User B (the Member).

## 2. Circle Creation & Activation
1. **Log in as User A**.
2. **Create Circle**: Go to the Dashboard and create a new Circle (e.g., 2 slots, ₦10,000 contribution, monthly).
3. **Invite Member**: Go to the Circle Details page and invite User B via their email address or username.
4. **Log in as User B**: Accept the invitation from the Dashboard.
5. **Log back in as User A**: Click the "Activate Circle" button.
6. **Verification**: Both members should now have Virtual Accounts provisioned. Verify the VA details are visible in the UI.

## 3. Funding (Sandbox Webhook)
1. **Simulate Transfer**: From the Nomba Sandbox Dashboard, simulate a bank transfer to User A's Virtual Account for the exact contribution amount (₦10,000).
2. **Repeat**: Simulate a transfer to User B's Virtual Account for the same amount.
3. **Verification**: 
   - Check the Circle Details page. Both members should be marked as "Paid" for the current cycle.
   - The Cycle status should automatically transition to `READY_TO_PAYOUT`.

## 4. Payout Execution
1. **Wait for Sweep**: The `payout-sweep` cron job will run and execute the payout. Alternatively, manually trigger it by calling `GET /api/cron/payout-sweep`.
2. **Verification**:
   - The recipient (User A, since they created it) should receive the payout (₦20,000 minus any fees).
   - The Circle Details should show the payout as completed.
   - The cycle rotation should advance to the next month, with User B as the next recipient.

## 5. Admin Verification
1. **Log in to Admin Dashboard**: Access `http://localhost:3001` using the `SUPER_ADMIN` credentials.
2. **Check Payouts**: Navigate to the Payouts tab and verify the payout is logged with a `SUCCESS` status.
3. **Check Webhooks**: Navigate to the Webhooks tab and verify the incoming funding webhooks were received and processed idempotently (200 OK).
