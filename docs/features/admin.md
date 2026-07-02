# Admin Panel

Phase 1 of the admin panel includes the shell, dashboard metrics, auth, and seed script.

## Phase 2: Read Views
Phase 2 introduces data visibility into the platform's core entities. We implement server-paginated tables and detail views.

### Entities Covered
- **Users**: View user profiles, default counts, and withdrawal accounts (masked).
- **Circles**: View savings circles, frequency, status, slots, and members.
- **Reconciliation**: Exception queue for inbound transfers where `matchStatus != MATCHED`.
- **Payouts**: System-wide payout history highlighting failed transfers.
- **Webhooks**: Log of incoming webhook receipts from Nomba and their signature validity.
- **Audit**: Log of all administrative actions.
- **Settings**: Super-Admin only view for Nomba integrations (clientId is masked, secret ciphers are omitted).

### Architecture
1. **API Layer**: `apps/admin/app/api/*` exposes paginated data.
2. **DTOs**: Each route defines precise Zod schemas in `dto/` to prevent Prisma data leaks.
3. **Data Fetching**: Typed wrappers in `lib/api/data/*` powered by a strict `api.get` client.
4. **React Query Hooks**: `features/*/queries/*` provide client-side data binding.
5. **UI Components**: Pages in `app/(dashboard)/*` render Tailwind-based tables and badges from `@workspace/ui`.
