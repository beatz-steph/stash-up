# Nomba Integration Layer

StashUp integrates with Nomba to create Virtual Accounts for circles and orchestrate cycle payouts.

## Endpoint Table

| Operation | Method + Path | Request (body unless noted) | Response (under `data`) |
|---|---|---|---|
| Obtain token | `POST /v1/auth/token/issue` | `grant_type`, `client_id`, `client_secret` | `access_token`, `refresh_token`, `expiresAt` |
| Refresh token | `POST /v1/auth/token/refresh` | `grant_type=refresh_token`, `refresh_token` | same |
| Create VA | `POST /v1/accounts/virtual/{subAccountId}` | `accountRef`, `accountName` | `bankAccountNumber`, `bankAccountName`, `bankName` |
| Bank account lookup | `POST /v1/transfers/bank/lookup` | `accountNumber`, `bankCode` | `accountName` |
| Payout transfer | `POST /v2/transfers/bank/{subAccountId}` | `amount`, `accountNumber`, `accountName`, `bankCode`, `merchantTxRef` | `id`, `status` |
| Fetch bank codes | `GET .../transfers/fetch-bank-codes-and-names` | — | bank list |

**Note for Sprint 3**: The `/v1/accounts/virtual/${SUB_ACCOUNT_ID}` endpoint returns `bankAccountNumber` and `bankAccountName`, which might differ slightly from the mapped fields today. Confirm response shape when provisioning VAs.

## Webhook Signature Verification

Nomba signs webhook events using HMAC-SHA256, but instead of signing the raw body JSON, it concatenates specific fields into a colon-separated string.

### The Contract
- **Header:** `nomba-signature`
- **Secret Key:** Stored in `NOMBA_SIGNATURE_KEY`.
- **String to Sign:** 
  `{event_type}:{requestId}:{userId}:{walletId}:{transactionId}:{type}:{time}:{responseCode}:{nomba-timestamp}`
  - Treat `"null"` literal in responseCode as an empty string.
  - The `nomba-timestamp` comes from the `nomba-timestamp` HTTP header.
- **Algorithm & Encoding:** `HmacSHA256` encoded in **Base64**.

### Webhook Safety Order
To prevent race conditions, retry loops, and unverified data injection, our receiver follows a strict 5-step order:
1. **Raw Body:** Extract `req.text()` first.
2. **Dedup:** Use Redis `claimWebhookEvent` to grab an atomic lock based on `requestId`.
3. **Verify:** Run `verifyNombaSignature`.
4. **Persist & Dispatch:** Upsert `WebhookReceipt` into the database. If `signatureValid` is `false`, the receipt is persisted for audit but `dispatchWebhookEvent` is skipped. If valid, dispatch to Sprint 4/5 logic based on `event_type` (e.g. `payment_success`, `payout_success`).
5. **Always Return 200:** Nomba retries indefinitely on non-200. Return 200 even for invalid signatures to avoid leaking failure contexts.
