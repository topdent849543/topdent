# RBAC and tenant-isolation acceptance scenarios

These are deployment acceptance scenarios for a Supabase staging project. Use disposable users and companies; never run the destructive cases against production data. The executable, database-independent permission/workflow smoke tests are in `tests/rbac-smoke.test.mjs` (`npm run test:security`).

## Fixture

Create companies **A** and **B** with products and orders in each. Create users with customer, company-manager (A), company-admin (A), limited platform-admin, platform-owner, global-driver, and company-driver (A) memberships. Create a company-bound custom role for A. Give the limited platform admin `orders.view` and `reports.view`, but not `finance.view`, `users.disable`, or `companies.suspend`. Create one active and one suspended subscription. Create an unassigned order, an order assigned to the A driver, and an order assigned to another driver.

## Scenarios and expected results

| Actor / attempt | Expected result |
|---|---|
| Customer opens `/admin`, `/platform`, `/company`, or `/driver` directly | Route guard denies access; protected data is not rendered. |
| Customer reads/updates `profiles.role`, changes a membership, or edits a product | Supabase rejects the mutation; no role or product data changes. |
| Company manager A lists companies, products, order items, fulfillment, and audit records | Only company A data is returned; finance figures appear only with `finance.view`. |
| Company manager A substitutes company B's UUID in company-admin, merchant-api, role-admin, reports, or driver assignment requests | Request is rejected with a non-sensitive authorization response; no B rows change. |
| Company manager A attempts to create/assign a platform owner or grant permissions they do not hold | Edge Function rejects the request and writes no membership/grant change. |
| Limited platform admin opens orders/reports sections | Permitted screens and non-financial data work. Finance cards, user-disable actions, company suspension, and any omitted sections are denied by server/RLS, not merely hidden. |
| Limited platform admin calls a finance route directly or changes a `company_id` parameter | `403`/permission error; wallet, withdrawal, and payout data are not returned. |
| Assigned active company driver A lists/accepts their eligible order and progresses through start, arrival, collection, and delivery | Only the assigned order and permitted delivery fields change; each successful action is auditable. |
| Driver attempts to accept/transition another driver's order, or change price/product/status fields directly | Rejected; order/product data remains unchanged. |
| Delivery collection is submitted without required status/reason or is replayed | Invalid state/reason is rejected; existing unique/locked assignment state prevents duplicate collection effects. |
| Merchant or admin attempts `new → delivered`, `waiting_for_driver → completed`, or another illegal transition | RPC rejects the transition; order and history remain unchanged. |
| Order owner submits valid cancellation while order is still new/under review | RPC records the reason, global and company status history, and audit event; all eligible company fulfillments are cancelled atomically. |
| Customer submits delivery slot in the past, beyond 14 days, or an invalid delivery type | Order placement wrapper rejects; the existing cart/payment RPC is rolled back in the same transaction. |
| Client inserts/updates audit, role, membership, driver assignment, fulfillment, subscription, wallet, or order status rows directly | RLS/table grants reject direct writes; only audited RPC/Edge Function paths can mutate protected state. |
| Platform owner attempts to edit/delete an audit event | RLS and table privileges reject it; audit history remains append-only. |
| Publisher attempts to set arbitrary click identities, release immature earnings, or change balance/withdrawal status | RPC/RLS denies or ignores caller-controlled identities; ledger/balances remain unchanged. |

## Suggested API checks

With authenticated staging JWTs, repeat the relevant edge cases directly against `/functions/v1/{function}` and the Supabase REST/RPC endpoints. Change only the company UUID, user ID, role key, resource UUID, or request status in each negative case. Verify both the HTTP response and the database state after each attempt. Confirm audit rows exist after successful privileged actions and are unchanged after rejected actions.

A database deployment is not verified by UI screenshots or this local test suite alone: run this matrix against the staging project after applying migrations and before production rollout.
