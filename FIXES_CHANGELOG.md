# NaijaBites bug-fix changelog (18 November 2026)

Scope: surgical fixes only. No features added, nothing removed or restructured.
Every item below was confirmed by the project owner in the browser unless marked otherwise.

## Fixes

1. `client/src/pages/SignIn.jsx` - CONFIRMED
   - Added the missing `vendor` area. `/signin?area=vendor` used to fall back to the customer
     area, so vendors signed in as customers and were then blocked from `/vendor`.
   - Rider post-login path corrected from `/rider` (does not exist, showed 404) to `/rider/deliveries`.

2. Database migrations V029 and V030 applied (`npm run db:migrate`) - CONFIRMED. No code change.
   - V030 adds `review_reason`, `reviewed_by`, `reviewed_at` to `rider_profiles`; without it
     `/admin/riders` failed with "Something went wrong".
   - V029 adds the `accepted` delivery status used by the rider Accept button.

3. `client/src/pages/Addresses.jsx` (`edit` function) - CONFIRMED
   - Editing an address sent the whole saved record (id, createdAt, updatedAt, coordinates) to the
     server, whose update validation is strict, so the save was rejected. Now only the form's own fields are copied.

4. `client/src/lib/session.js` - APPLIED, sign-out/sign-in test not yet run by the owner
   - The checkout page remembers an unpaid order in the tab's sessionStorage. It was not cleared when
     the signed-in person changed, so the next account saw "Resume payment" and "Order not found",
     and the "Add one now" address link was hidden. Sign-in and sign-out now clear it.
   - The 18 existing client unit tests pass with this change.

5. Live GPS tracking (new, approved by the owner) - CONFIRMED end to end
   - `server/migrations/V031__rider_live_location.up.sql` / `.down.sql`: new table `delivery_live_locations`
     (latest rider position per delivery). Apply with `npm run db:migrate`.
   - `server/src/http/trackingRoutes.js` (new) + two lines in `server/src/app.js`:
     - `POST /api/v1/tracking/rider/location`: rider only, only for their own delivery, only while it is
       accepted / picked up / in transit.
     - `GET /api/v1/tracking/customer/orders/:id/tracking`: customer only, only their own order; the rider's
       position is shown only after pickup.
   - `client/src/app/router.jsx`: added routes `/track/:orderId` (customer map, existing `TrackOrder.jsx`) and
     `/rider/dashboard` (rider "share my location", existing `RiderDashboard.jsx`). Both page files are unchanged.
   - Checked: rider cannot post for another rider's or a finished delivery; another customer gets "Order not found".
   - No link to these pages was added anywhere in the UI. Open them by URL (see below), or ask for the links to be added.

## How to use live tracking
- Rider: sign in at /signin?area=rider, accept and pick up an order, open /rider/dashboard, paste the 26-character order ID, click Share My Live Location.
- Customer: sign in as the order's owner, open /track/<orderId>. The map refreshes every 5 seconds.

## Verified working with no change needed
- Admin: /admin, /admin/riders (approve flow), /admin/deliveries (assign rider), /admin/delivery-zones (add, edit, activate).
- User: home, search, product pop-up, vendor page, about, community, menu, sign-up, forgot password,
  cart, addresses, checkout, Paystack payment and return, account, sign-out.
- Vendor: dashboard, products (add, edit, publish, unpublish, archive).
- Rider: sign-in, /rider/deliveries (accept, pick up, start, deliver), rider application form.
- Tracking: /orders/:id/tracking for a new order (shows "not created yet" message correctly); live map via /track/:orderId and /rider/dashboard.

## Not tested / not done
- Vendor order Accept and Reject buttons: the test vendor has no orders.
- /orders/:id/tracking timeline for a fully delivered order was not confirmed.
- No in-app links to /track/:orderId or /rider/dashboard (not requested).
- Fix 4's sign-out/sign-in check (above).
- `/rider-portal` shows the application form to signed-out visitors (submitting asks them to sign in). Left unchanged.
- I could not run `vite build` here (the bundled node_modules is Windows-only). Please run `npm run build`.

## Housekeeping
- `make-test-vendor.mjs`, `diag-admin.mjs`, `diag-tracking.mjs` are throwaway helpers, not part of the app.
  Delete them before sharing the project.
- `.env` contains real credentials (Gmail app password, Paystack key). Rotate them and keep `.env` out of ZIPs.
