# NaijaBites code audit — 15 November 2026

## Repairs made

### 1. Migration test maintenance
- Fixed the delivery-foundation migration test. It incorrectly asserted that the project had exactly 21 migrations even though the repository contains a complete V001–V028 sequence. The test now verifies that the sequence starts at V001, has no gaps, and reaches the latest migration found in the directory.

### 2. Checkout order creation endpoint
- Found that `client/src/lib/payments.js` and `client/src/pages/Checkout.jsx` submit `POST /me/checkout`, and `server/src/orders/service.js` already implements transactional order creation, but `server/src/http/checkoutRoutes.js` did not register the POST route.
- Added `POST /me/checkout` and delegated to `orders.create`.
- The route forwards only authenticated user identity, request IP, and user-agent audit context. Product availability, stock, address ownership, and prices continue to be validated by the order service within its transaction; client totals are not trusted.
- New orders return HTTP 201; idempotent replays return HTTP 200.

## Verification performed
- Node.js 22.16.0.
- `node --check` passed for every `.js` file under `shared/src`, `server/src`, and `client/src`.
- Shared workspace tests: 7/7 passed.
- Client workspace tests: 18/18 passed.
- Server test run: 61 tests passed; 6 test files failed to load because npm dependency installation did not complete. The failures are module-resolution errors for missing packages (`zod`, `express`, and `mysql2`), not assertion failures.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out in this environment. Consequently, a production client build and complete server integration tests remain blocked.

## Remaining verification / limitations
- Run `npm ci` in a network-enabled environment, then `npm test` and `npm run build`.
- Run integration tests against a disposable MySQL database after applying migrations V001–V028.
- Verify Paystack initialize, callback, webhook, refund, and idempotent settlement with provider test credentials.
- Verify email delivery, media upload, vendor/rider operations, and complete browser workflows with their configured providers.
- This is not a certification that every feature is production-ready. Do not deploy to production without the remaining integration and security checks.

## Follow-up audit — 16 November 2026

### Branch inventory movement safety
- Found that the vendor inventory adjustment service accepted semantically contradictory movements (for example, a positive `damage` adjustment or a negative `restock`).
- It also relied on the database to reject a balance above MySQL `INT UNSIGNED` maximum, which surfaced as a generic database error.
- Added `server/src/inventory/validation.js` and integrated it into branch inventory adjustments. Restock/return require positive deltas, damage requires negative deltas, adjustment supports either direction, and resulting balances must remain within `0..4,294,967,295`.
- Added four focused tests; all 4 pass.

### Verification in this continuation
- `node --test server/test/inventory-validation.test.js`: 4/4 passed.
- Full workspace tests remain partially blocked because dependencies are incomplete in the provided environment (`zod`, `express`, and `mysql2` are missing). In the latest run, the shared suite passed 7/7 and client suite passed 18/18; server reported 61 passing tests and 6 test files unable to load due to missing packages.
- No live Paystack, MySQL, browser checkout, refund, or rider workflow was executed. These remain unverified and must not be treated as production-certified.

### Late Paystack capture after order cancellation — 16 November 2026
- Found a race between vendor rejection and Paystack completion: a customer could complete an already-open payment page after the vendor had cancelled the unpaid checkout. The previous settlement path checked payment status and stock, but did not re-check the current order state under lock; it could therefore revive a cancelled order.
- Settlement now locks the order first, then the payment transaction (matching checkout's order-before-payment lock order), and only confirms/deducts stock when the order remains `pending_payment` with `unpaid` payment status.
- If Paystack has captured money for an order that is no longer payable, the transaction is recorded as successful and the order is moved to `payment_review`; inventory is not deducted and active reservations are released. This preserves the captured-payment record for administrative refund/reconciliation instead of falsely confirming fulfilment.
- Regression coverage added: successful payment after vendor rejection must not revive the cancelled order or consume inventory.
- Focused tests: 16/16 passed (payment settlement, webhook signatures, Paystack refund client, and inventory movement validation). The settlement tests were run with a temporary local mysql2 import stub because the provided `node_modules` does not contain the actual mysql2 package; this validates service logic with the test harness, not a real MySQL integration.
- Full workspace tests, production build, and live Paystack/MySQL integration remain unverified until dependencies and provider/database credentials are available.

### Branch fulfilment selector hardening — 16 November 2026
- Further inspection confirmed that `selectFulfilmentBranch` is currently not called by checkout or payment settlement. The branch inventory schema exists, but checkout inserts reservations with `branch_id = NULL`; settlement still deducts `products.stock_on_hand`. This is a real end-to-end integration gap, not a completed feature.
- Hardened the selector itself: it now correctly interprets MySQL-style boolean values including string `"0"`, rejects malformed/negative inventory quantities as unavailable, validates branch/customer coordinates, and chooses a stable lowest-ID branch when GPS is unavailable.
- Regression tests cover disabled flags, invalid stock values, missing GPS tie-breaking, all-items-at-one-branch selection, and proximity ranking.
- Verification: all JavaScript files passed `node --check`; shared tests 7/7; client tests 18/18 (with a temporary workspace symlink to resolve the local `@naijabites/shared` workspace package); inventory validation and delivery/branch foundation tests 14/14. No MySQL integration, production build, or live delivery flow was run.
- Next critical task: wire branch selection into order creation, reserve branch inventory under transaction/row locks, and consume/release branch inventory with ledger movements during settlement/cancellation. Preserve legacy product-level stock only for vendors/products that have not been migrated to branch inventory, with explicit rules and tests to avoid mixing the two stock models. This was the status at that point; the subsequent “Branch inventory lifecycle integration” section records the implemented checkout/cart/payment integration. Cancellation/refund restocking remains a separate follow-up.

### Branch inventory lifecycle integration — 16 November 2026
- Connected checkout to `selectFulfilmentBranch`. Items are grouped by vendor and the complete tracked-stock item set for each vendor must be fulfilled by one active branch. The selected branch ID is persisted on `vendor_orders` and on each tracked `stock_reservations` row.
- Checkout locks the candidate branch inventory and active reservation rows before calculating available stock. This complements the existing product-row lock so concurrent checkout requests cannot reserve the same branch stock twice.
- Added a compatibility path for vendors with no branches and no branch inventory configuration: those orders retain `NULL` branch IDs and use legacy product stock. For vendors with active branches, missing branch stock is initialized from legacy product stock at the lowest-ID active branch, with an `opening` ledger movement. This import is blocked while unresolved legacy reservations or in-flight Paystack authorizations exist; vendors with configured stock at inactive branches are not silently re-seeded into an active branch.
- Payment settlement now uses the vendor order's branch assignment. It locks and deducts branch inventory, writes a `sale` movement to `inventory_movements`, consumes the order's reservation, and verifies that other active reservations remain covered. A late payment cannot consume another order's reserved stock; it enters `payment_review` instead.
- Cart availability and quantity limits now use the maximum available quantity at an active branch, subtracting reservations for that same branch. Existing branchless vendors continue to use legacy product stock. Cart tests now cover active branch stock, reservations, and inactive branches. Reservations tied to still-initializing/initialized Paystack transactions remain protected even after their nominal hold expiry; expired holds without an in-flight payment are cleaned up before legacy-to-branch stock initialization.
- Vendor order list/detail payloads expose the assigned fulfilment branch. Manual vendor stock reductions are rejected if they would put physical stock below active reservations.
- Focused verification: 42/42 tests passed across branch checkout allocation, cart service, inventory validation, payment settlement, and branch/delivery foundation suites. `node --check` passed for every JavaScript file under `server/src` and `server/test`.
- Test caveat: because the actual `mysql2` package was absent and `npm ci` timed out, the focused suites that import the DB pool used a temporary local `mysql2` stub. The tests exercise service logic with in-memory SQLite/mock database harnesses, not a real MySQL server. No real MySQL locking/concurrency integration, live Paystack, or full workspace/build verification was possible in this environment.
- Remaining verification: install dependencies in a network-enabled environment, run the complete workspace test suite and production build, then run the new checkout/branch/payment flow against disposable MySQL with concurrent-order tests before production deployment.
