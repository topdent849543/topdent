# Multi-company RBAC rollout and rollback plan

## Migration order

Apply the timestamped migrations in order:

1. `20260927060000_multitenant_rbac_schema.sql` — companies, roles/permissions, memberships, audit, scoped fulfillment and subscription schema, seeds, legacy mapping, and integrity helpers.
2. `20260927061000_multitenant_rbac_rls.sql` — replaces conflicting policies on the protected tables and revokes direct sensitive writes.
3. `20260927062000_multitenant_rbac_finance.sql` — finance-read scoping, controlled wallet/withdrawal behavior, and audit-safe finance RPC changes.
4. `20260927063000_multitenant_rbac_workflows.sql` — checked order/driver transitions, company assignment, collection, and status history.
5. `20260927064000_delivery_schedule.sql` — delivery speed/appointment fields and an authenticated transactional wrapper around the existing cart-order RPC.

Deploy the matching Edge Functions and client bundle only after the database migrations have succeeded. The new delivery wrapper expects the existing `public.place_order_from_cart(uuid,text)` RPC to remain available and return an object containing `order_id`.

## Pre-deployment safeguards

- Take a Supabase database backup/snapshot and export the current migration history.
- Apply and test against a staging copy first; run `npm run check`, `npm run lint`, `npm run test:security`, `npm run build:web`, and the scenarios in `supabase/tests/rbac-acceptance.md`.
- Verify the first `platform_owner` is assigned through a controlled SQL/admin bootstrap procedure. Public signup never creates a platform role.
- Confirm environment secrets are configured only in Supabase/hosting secret stores, never in client `.env` values bundled into the app.

## Rollback approach

These migrations intentionally preserve legacy orders, products, balances, and transaction history. They also backfill legacy merchant/company associations and replace unsafe policies. **Do not run a blanket `DROP TABLE` or delete the new rows to roll back.** A safe operational rollback is:

1. Stop rollout of the new client and Edge Function versions; keep the app on the previous bundle if the database migration has not yet been applied.
2. If the database migration has been applied but no new writes have occurred, restore the pre-deployment Supabase snapshot to a separate recovery project, validate it, then perform the provider-supported restore/cutover procedure.
3. If users have written new memberships, audit events, subscriptions, order history, or delivery preferences, prefer a reviewed forward-fix migration. Restoring the old snapshot would discard those writes and must only happen after an explicit recovery decision and a fresh backup.
4. Keep the new tables/columns in place during application rollback until the older client and function versions are confirmed not to depend on them. Retain an export of audit and financial ledgers.

A down migration that silently removes the new data is deliberately not supplied: the schema backfill is additive, while the RLS replacement is security-critical. Full reversal requires restoring the pre-change database snapshot or a separately reviewed policy-only rollback that does not delete data.
