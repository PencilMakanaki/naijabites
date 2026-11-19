# NaijaBites V022–V028 implementation handoff

This delivery adds the next database and backend foundation to the uploaded V001–V021 project. It is deliberately additive and does not apply migrations to any database.

## Included in this package

- **V022 — Inventory movement ledger:** immutable movement history table and vendor branch inventory list, adjustment, and movement-history endpoints (`/api/v1/vendor/inventory`). Adjustments are transactional, lock the inventory row, reject negative stock, and write an audit entry.
- **V023 — Delivery quote audit:** persistent quote-event schema for route source, endpoints, distance, weight, fee, and fallback/failure outcomes.
- **V024 — Order cancellation requests:** schema for customer cancellation requests and administrator review.
- **V025 — Vendor payout ledger:** payout request/status schema and vendor financial ledger entries.
- **V026 — Rider delivery operations:** rider profile, delivery assignment/status and delivery event schemas.
- **V027 — Customer engagement and wallet:** product reviews, notifications, customer wallet and wallet transaction schemas.
- **V028 — Platform operations:** incidents and feature-flag configuration schema.

## Important integration status

This is **not yet a verified production-complete release**. The new migrations and inventory API are implemented as additive foundations. The following workflows still require application-level integration and verification before launch:

1. Checkout must atomically allocate one eligible branch per vendor order and create branch stock reservations. The existing checkout still needs to be connected to branch allocation.
2. Payment settlement must consume reservations and write `sale` inventory movements; failed/expired payment and cancellation flows must release reservations and write `release` movements.
3. Delivery quote calculation must be wired into checkout totals and payment initialization, with quote events written to `delivery_quote_events`.
4. Customer cancellation routes, review moderation/eligibility, notification generation/read APIs, and wallet credit/debit operations are not exposed by this package yet.
5. Vendor payout approval/Paystack transfer reconciliation and rider onboarding/dispatch/status APIs are not exposed by this package yet. No automatic money movement is enabled.
6. React pages for inventory, rider operations, payouts, wallet, reviews and incident management remain to be connected to these APIs/tables.
7. Integration tests against MySQL 8.4, payment-provider sandbox tests, full workspace tests and production build are still required.

## Migration safety

Migrations V022–V028 are not applied. Back up the database, review the SQL and test on a staging copy before running `npm run db:migrate`. Do not run rollback migrations against production without reviewing data-loss implications. The down migrations drop the newly introduced tables and therefore remove data written to them.

## Merge instructions

Merge the contents of `naijabites/` into the existing project folder. Preserve your local `.env`, `.git`, local uploads and any local database files. This ZIP intentionally excludes `.env`, database dumps, `node_modules`, `.git`, and generated build output.
