# Circles (Core Feature)

Circles are the core of the StashUp platform, representing an Ajo/Esusu savings group.

## Lifecycle
1. **FORMING**: A circle is created with a specific number of slots, contribution amount, and payout frequency (e.g., weekly, monthly). The creator invites members.
2. **ACTIVATING**: Once all slots are filled, the creator activates the circle. Virtual Accounts are provisioned for all members via Nomba.
3. **ACTIVE**: Members fund their virtual accounts. The system tracks cycles (one per payout period).
4. **COMPLETED**: The circle ends when all cycles are completed and all members have received their payouts.

## Key Concepts
- **Memberships**: Links a User to a Circle. Tracks `vaProvisionStatus` (whether their Nomba Virtual Account has been created).
- **Cycles**: Represents a time period where funds are gathered and a specific member receives the payout. The recipient is determined by a rotation schedule.
- **Rotation**: The order of members receiving the payout. It advances automatically when a payout is completed.
- **Pots**: The total expected contribution for a cycle.

## Access Control
- `requireCircleMember(circleId, userId)`: Ensures a user is a member of the circle before accessing circle data.
- `requireCircleCreator(circleId, userId)`: Ensures only the creator can perform actions like activating the circle or cancelling invites.
- `blockedFromCircles`: Users flagged by admins cannot create or join circles. Checked on create, invite, and accept.

## Virtual Accounts
Provisioned during the activation phase. If provision fails for any reason (e.g., Nomba downtime), the circle activation succeeds for the remaining members, and the failed ones are marked as `FAILED`. The creator can use the "Retry Provisioning" endpoint to retry creating VAs for the failed members.

## Payouts
Initiated automatically by the sweep cron job when a cycle reaches `READY_TO_PAYOUT`. See `docs/runbooks/payout-retry.md` and `docs/runbooks/reconciliation.md` for more details on money movement.
