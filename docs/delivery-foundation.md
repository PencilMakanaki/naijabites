# Delivery foundation: zone-independent checkout

## What changed

Checkout no longer looks up `delivery_zones` to decide whether a customer's address can proceed. The backend reads the existing `delivery_fee_flat_kobo` platform setting and applies that configured amount as a temporary flat delivery fee.

Order creation independently reads the same setting inside its database transaction. It does not trust a delivery fee supplied by the browser. New orders record `delivery_zone_id = NULL` and `delivery_zone_name = 'Temporary flat-rate delivery'` so the historical order schema remains compatible.

The existing `delivery_zones` table and admin routes are deliberately retained. Existing historical orders may refer to those records, and removing the table or its foreign key would be a separate data migration.

## Configuration requirement

`platform_settings.delivery_fee_flat_kobo` must contain a non-negative integer amount in kobo. For example, ₦2,500 is `250000` kobo. The setting must be configured by an administrator before checkout can return a valid quote or create an order. A missing or invalid setting produces a configuration error rather than silently charging zero.

## Scope and limitations

This package removes the fixed-zone blocker; it does not yet calculate real distance or determine whether a particular vendor can deliver to a particular customer. The flat fee is a temporary fallback. Vendor branch coordinates already exist in the catalogue schema, but customer coordinates, nearest-branch selection, road-distance estimates, rider availability, and per-vendor delivery fees remain future work.

The current order model creates one customer order with vendor sub-orders. This package does not yet split delivery charges by vendor. That must be designed together with multi-vendor delivery and rider assignment so each vendor fulfilment can have its own origin, destination, fee, and delivery status.

## Verification

Run the normal project checks after merging:

```bash
npm test
npm run build
```

Then check that `delivery_fee_flat_kobo` is configured in the database and open checkout with an address that previously had no matching delivery zone. The checkout summary should no longer report that a zone is unavailable.
