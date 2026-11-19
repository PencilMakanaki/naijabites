# Changelog

## M2b: the real storefront (10-11 November 2026)

Added
- Catalogue tables (migration V006): markets, categories, vendors, vendor branches, products, pictures.
  The six markets from the original app are loaded by the migration.
- Public API: /markets, /categories, /products (market, search, vendor, category, sorting, paging),
  /products/:id, /vendors, /vendors/:slug, /search/suggest. Only published products with a picture
  from approved vendors are ever shown.
- Home page with real data: Today's Market follows the time in Lagos (as before), market tabs, search,
  Load more, sidebar cards, Food Community button.
- Product pop-ups (shareable /p/ addresses), vendor pages, About page (original text), menu drawer.
- Share previews: product and vendor links get a title, description and photo for WhatsApp, Facebook and Google.
- npm run seed:dev (sample data from the original demo menu) and npm run smoke:catalogue (checks your real MySQL).
- 40 more automated tests: the real catalogue SQL runs against SQLite, including paging and sorting across
  page boundaries, search safety, hidden items, and a check that the test schema matches the MySQL migration.

Changed
- product_meal_times was dropped: breakfast, lunch and dinner are markets, as in the original app.
- Search uses simple text matching for now (the FULLTEXT index exists for when the catalogue grows).

Fixed (found by measuring in a real browser)
- Product pop-up: text beside the photo could be cut off at the bottom.

## M2a, checked and fixed (7-9 November 2026)

Checked by running the real server code against an in-memory stand-in for MySQL, and by clicking through the
built app in a real browser (home, sign-in, admin, sign-up, email confirmation, account, password reset, phone sizes).

Fixed
- Account page: after saving your details the "Saved." message never appeared (the section reset itself). Fixed.
- Phone layout: the "Sign In" button wrapped onto two lines and its icon was squashed. The top bar now fits a 390px screen.
- Phone layout: the search hint was cut off. Phones now show a shorter hint.
- API: /health and /ready were not marked uncacheable like the other API responses. Fixed.
- Dockerfile: no longer fails when there is no package-lock.json yet.
- .env.example: added the email settings that M2a needs.

Added
- A permanent API test suite (server/test/api-flow.test.js) with an in-memory database stand-in
  (server/test/helpers/fakeDb.js): sign-up, confirmation, profile, password change and reset, email change,
  devices, the 5-attempt lock, old-app passwords, staff sign-in, CSRF, bad requests and request limits.

Known and expected
- Browsers show a red "401" line in the console on every page for visitors who are signed out. That is how the
  server tells the app "nobody is signed in". It is not an error.

## Delivery foundation — remove fixed-zone checkout dependency

- Checkout no longer requires a manually configured delivery zone to accept a customer's address.
- Checkout and order creation now use the existing `delivery_fee_flat_kobo` platform setting as a temporary configurable flat-rate fee.
- New orders store a null `delivery_zone_id` and the label `Temporary flat-rate delivery`; the historical delivery-zone tables and admin management endpoints remain intact for compatibility and future migration work.
- This is an interim pricing mode only. Vendor-to-customer distance calculation, delivery eligibility, and per-vendor fulfilment pricing are not implemented in this package.

## 15 November 2026 — Checkout route repair
- Implemented `POST /api/v1/me/checkout`, which was documented but missing from the checkout router.
- The route now delegates order creation to the transactional order service, passes request audit context, and returns HTTP 201 for new orders or HTTP 200 for idempotent replays.
- Client checkout already called this endpoint, so the missing route prevented customers from placing orders; this restores the server-side entry point without trusting client-supplied prices or totals.

## 16 November 2026 — Branch inventory movement validation
- Added server-side validation for vendor branch stock movements before any database write.
- Restock and return movements must increase stock; damage movements must decrease stock; adjustments may move either way.
- Rejects zero, fractional, excessive, unsupported, negative-result, and `INT UNSIGNED` overflow balances with clear API errors.
- Added focused unit tests for movement direction and stock boundary conditions.

## 16 November 2026 — Late payment after vendor rejection
- Fixed a payment-settlement race: a customer could leave Paystack open, a vendor could reject and cancel the unpaid checkout, and Paystack could subsequently report a successful charge. Settlement previously could change the cancelled order to `confirmed` if stock remained available.
- Settlement now locks the order before the payment row, verifies that the order is still `pending_payment` and `unpaid` before consuming inventory, and routes captured payments for cancelled/non-payable orders to `payment_review` without reviving the order or deducting stock.
- Added a regression test for a successful Paystack charge arriving after vendor rejection.

## 16 November 2026 — Branch fulfilment selector hardening
- Hardened the shared branch-selection helper used by the delivery foundation: database boolean values such as string `"0"` are now treated as disabled instead of truthy, malformed/negative inventory values cannot qualify a branch, and missing GPS coordinates produce deterministic branch-ID ordering.
- Corrected branch coordinate validation and retained the all-items-at-one-branch rule; vendor order items are never split across branches by the selector.
- Added regression tests for string-zero flags, invalid inventory values, and missing-coordinate tie-breaking.
- Important remaining integration gap: checkout currently creates stock reservations with `branch_id = NULL`, and payment settlement still decrements legacy `products.stock_on_hand`. The branch selector and branch inventory tables are therefore not yet wired end-to-end into checkout/payment. This is the next critical implementation task; branch-level fulfilment must not be considered operational yet. This was the status at the time of this entry and is superseded by the later “Branch inventory connected to cart, checkout and payment” entry below.

## 16 November 2026 — Branch inventory connected to cart, checkout and payment
- Checkout now groups items by vendor, selects one active fulfilment branch for the vendor's complete item set, ranks eligible branches by customer distance when GPS is available, and reserves tracked quantities against that branch.
- Branch inventory rows and active branch reservations are read under transaction locks. A vendor's order is never split across branches. If no active branch exists and no branch stock has ever been configured, the legacy product-level stock path remains available for compatibility.
- When a vendor has active branches but a tracked product has never had branch inventory configured, the first checkout imports the legacy product stock into the vendor's lowest-ID active branch and records a ledger opening movement. Migration is blocked while older product-level reservations or in-flight Paystack authorizations still exist, preventing the two stock models from being mixed unsafely.
- Successful Paystack settlement now deducts the selected branch's stock, records a `sale` inventory movement, consumes the reservation, and checks that the deduction will not consume stock reserved by another active order. If branch stock is insufficient, payment is recorded for `payment_review` without deducting inventory.
- Cart add, quantity changes and availability indicators now use active branch stock and branch-specific reservations once branch inventory exists. Legacy product stock is used only when branch inventory has not been configured. Reservations with an in-flight Paystack authorization remain protected after nominal expiry; expired reservations without an in-flight payment can be cleaned up safely.
- Vendor order list/detail responses now include the fulfilment branch ID and branch name.
- Vendor inventory adjustments cannot reduce physical stock below active unpaid-order reservations.
- Added regression tests for branch-based cart limits, branch reservation subtraction, inactive branch stock, branch-level payment deductions, inventory ledger movements, and late payment protection.


## 16 November 2026 — Vendor product management
- Added the vendor product API for listing, creating, editing, publishing/unpublishing and archiving products.
- Added the vendor product-management page at `/vendor/products`, linked from the vendor order dashboard.
- New products are unpublished drafts; only approved vendors can manage products, ownership is scoped to the signed-in vendor, and products restricted by moderation cannot be republished.
- Added service tests for approval gating, ownership scoping, moderation and input validation.

## M3.14 — Delivery assignment and customer tracking
- Added administrator dispatch queue for paid, active orders and approved-rider assignment.
- Added rider delivery workspace with accept/decline, pickup, in-transit and delivery completion actions.
- Added delivery status event timeline and customer-owned delivery tracking endpoint/page.
- Added a dedicated rider sign-in area and role-protected delivery route.
- Added V029 to persist the rider-accepted delivery state while retaining existing V026 delivery tables.
- Restored rider application and administrator approval workflow against existing V026 rider profile schema so the dispatch workflow can use real approved rider accounts.
- Added V030 rider review metadata.
