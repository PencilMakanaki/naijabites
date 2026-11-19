import { Router } from 'express';
import { createCartService } from '../cart/service.js';
import { createAddressService } from '../addresses/service.js';
import { getOrderSettings } from '../settings/service.js';
import { createOrderService } from '../orders/service.js';
import { requireRole } from './authMiddleware.js';
import { badRequest, notFound } from './errors.js';
import { ok } from './respond.js';
import { calculateDistanceWeightQuote } from '../delivery/pricing.js';
import { createGoogleRoutesClient } from '../delivery/googleRoutes.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function checkoutRoutes({
  pool,
  config,
  cart = createCartService({ pool }),
  addresses = createAddressService({ pool }),
  orders = createOrderService({ pool }),
}) {
  const router = Router();
  // We pass a dummy key just in case, though OSRM doesn't need it
  const routesClient = createGoogleRoutesClient({ apiKey: config?.googleRoutesApiKey || 'dummy' });

  router.use(requireRole('customer'));

  // GET /me/checkout
  router.get('/', async (req, res) => {
    const userId = req.auth.user.id;
    const requestedAddressId = req.query.addressId;

    if (requestedAddressId && !validId.test(requestedAddressId)) {
      throw badRequest('Invalid delivery address.');
    }

    const [summary, savedAddresses] = await Promise.all([
      cart.get(userId),
      addresses.list(userId),
    ]);

    let selectedAddress = null;

    if (requestedAddressId) {
      selectedAddress = savedAddresses.find(
        (address) => address.id === requestedAddressId,
      );
      if (!selectedAddress) throw notFound('Delivery address not found.');
    } else {
      selectedAddress =
        savedAddresses.find((address) => address.isDefault) ??
        savedAddresses[0] ??
        null;
    }

    const settings = await getOrderSettings(pool);
    let deliveryFeeKobo = settings.deliveryFeeFlatKobo;
    let deliveryMethod = 'flat_rate_temporary';
    let deliveryDescription = 'Flat-rate delivery.';

    console.log("=== CHECKOUT DEBUG ===");
    console.log("Pricing Mode:", settings.deliveryPricingMode);
    console.log("Selected Address:", selectedAddress);

    // --- NEW DISTANCE-BASED PRICING LOGIC ---
    if (settings.deliveryPricingMode === 'distance_weight' && selectedAddress) {
      try {
        const [branchRows] = await pool.execute(
          `SELECT latitude, longitude FROM vendor_branches WHERE id = 1 LIMIT 1`
        );
        const branch = branchRows[0];
        console.log("Branch Coords:", branch);

        if (branch && branch.latitude && branch.longitude && selectedAddress.latitude && selectedAddress.longitude) {
          
          const originLat = Number(branch.latitude);
          const originLng = Number(branch.longitude);
          const destLat = Number(selectedAddress.latitude);
          const destLng = Number(selectedAddress.longitude);

          const route = await routesClient.computeDistance({
            origin: { latitude: originLat, longitude: originLng },
            destination: { latitude: destLat, longitude: destLng },
          });

          console.log("OSRM Route Result:", route);

          const quote = calculateDistanceWeightQuote({
            distanceMeters: Number(route.distanceMeters),
            weightGrams: 0,
            baseFeeKobo: Number(settings.deliveryBaseFeeKobo || 0),
            perKmKobo: Number(settings.deliveryPerKmKobo || 0),
            perKgKobo: Number(settings.deliveryPerKgKobo || 0),
            minFeeKobo: Number(settings.deliveryMinFeeKobo || 0),
            maxFeeKobo: Number(settings.deliveryMaxFeeKobo || Number.MAX_SAFE_INTEGER),
          });

          console.log("Calculated Quote:", quote);

          deliveryFeeKobo = quote.feeKobo;
          deliveryMethod = 'distance_weight';
          deliveryDescription = `Distance-based delivery (${(quote.distanceMeters / 1000).toFixed(1)} km).`;
        } else {
           throw new Error('Missing coordinates for distance calculation.');
        }
      } catch (error) {
        console.error('❌ Distance calculation failed:', error.message);
        deliveryDescription = 'Fallback flat-rate delivery (distance calculation failed).';
      }
    }

    const paymentEnabled = Boolean(config?.paystack?.enabled);
    const blockers = [];

    if (!summary.items.length) blockers.push('Your cart is empty.');
    if (summary.items.some((item) => !item.available)) blockers.push('Remove unavailable items before continuing.');
    if (!selectedAddress) blockers.push('Add a delivery address before continuing.');
    if (!paymentEnabled) blockers.push('Online payment is temporarily unavailable.');

    const totalKobo = deliveryFeeKobo === null ? null : summary.subtotalKobo + deliveryFeeKobo;

    return ok(res, {
      cart: summary,
      addresses: savedAddresses,
      selectedAddressId: selectedAddress?.id ?? null,
      delivery: {
        method: deliveryMethod,
        description: deliveryDescription,
      },
      deliveryFeeKobo,
      subtotalKobo: summary.subtotalKobo,
      totalKobo,
      canContinue: blockers.length === 0,
      blockers,
      orderCreationEnabled: true,
      paymentEnabled,
    });
  });

  // POST /me/checkout
  router.post('/', async (req, res) => {
    const order = await orders.create(
      req.auth.user.id,
      req.body,
      {
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
      },
    );
    return ok(res, order, undefined, order.alreadyExists ? 200 : 201);
  });

  return router;
}