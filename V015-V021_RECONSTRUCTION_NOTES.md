# NaijaBites V015–V021 reconstruction package

This is a **fresh reconstruction** from the available V001–V014 source archive and the milestone decisions recovered from prior-chat handover notes. It is not a byte-for-byte recovery of the previous chat's working directory. The original V001–V014 files are retained.

## Included database migrations

- V015: `payment_transactions.gateway_response` becomes MEDIUMTEXT. Down migration intentionally does not narrow the column because doing so could truncate saved gateway payloads.
- V016: optional paired customer-address GPS coordinates with range and pair checks.
- V017: immutable delivery-coordinate snapshot columns on orders.
- V018: branch-product inventory table, with composite vendor/branch and vendor/product foreign keys. Existing product-level stock is not copied into branch inventory.
- V019: optional vendor-order fulfilment branch and branch-aware stock reservations. Existing reservations are backfilled with their product's vendor and retain NULL branch assignment.
- V020: optional product weight and order-item weight snapshot.
- V021: vendor-order delivery quote snapshot fields and pricing settings.

## Application foundation included

- Address validation/storage accepts optional paired latitude/longitude.
- `server/src/delivery/geo.js`: coordinate validation and straight-line distance (proximity only; not road distance).
- `server/src/delivery/googleRoutes.js`: server-side Google Routes API client, strict coordinate checks, 8-second default timeout, response validation. Set `GOOGLE_ROUTES_API_KEY` in the user's local `.env`; no key is supplied.
- `server/src/delivery/pricing.js`: integer-kobo distance/weight pricing with started-kilometre/kg rounding and min/max caps.
- `server/src/inventory/branchSelection.js`: one-branch-completeness selector; never splits a vendor's items across branches.

## Important implementation boundary

The reconstructed package provides the complete V015–V021 migration set and foundational modules, but the original prior-chat working-copy's full branch-inventory service/API, transaction-safe checkout allocation, payment settlement consumption, cancellation release, movement ledger (V022), and end-to-end integrations were not recoverable from the linked conversations. They are **not represented as complete** here. The checkout continues using the existing flat-rate fee; dynamic pricing is a foundation and is not switched on. Before production use, integrate and test the remaining workflows against the actual merged source.

## Merge instructions

Extract this ZIP into the existing project folder and merge `naijabites/` contents, preserving the local `.env`, `.git`, `.gitignore`, database data, and local-only files. Review the migration SQL before running it. Apply migrations only to a backed-up development/staging database first; never run them on the live database without a reviewed backup and explicit approval.

## Verification status

- Original migration baseline inspected: V001–V014.
- Migration sequence and referenced tables/columns reviewed against the supplied baseline.
- JavaScript syntax checks and focused unit tests are included/run in the reconstruction process.
- MySQL 8.4 execution, rollback execution, full server tests, and full frontend build are not claimed as verified in this environment.
