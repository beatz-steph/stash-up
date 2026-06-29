# API Reference

Each route group has a standard DTO (Data Transfer Object) defined in `apps/web/app/api/[feature]/dto/`.

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/api/withdrawal-account/resolve` | `POST` | Resolves bank account name using Nomba name-enquiry. |
| `/api/webhooks/nomba` | `POST` | Primary webhook receiver for all Nomba events (inbound payments and outbound payouts). |

