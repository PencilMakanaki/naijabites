import { Router } from 'express';
import { requireRole } from './authMiddleware.js';
import { badRequest, conflict, notFound } from './errors.js';
import { ok } from './respond.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
// A rider may share a position once the delivery is accepted and until it ends.
const RIDER_MAY_SHARE = ['accepted', 'picked_up', 'in_transit'];
// A customer only sees the rider on the map once the food has been picked up.
const CUSTOMER_MAY_SEE = ['picked_up', 'in_transit'];

function readCoordinate(value, min, max, label) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${label} is not valid.`);
  return n;
}

export function trackingRoutes({ pool }) {
  const router = Router();

  // POST /tracking/rider/location  { orderId, latitude, longitude }
  router.post('/rider/location', requireRole('rider'), async (req, res) => {
    const orderId = String(req.body?.orderId ?? '').trim();
    if (!validId.test(orderId)) throw badRequest('Invalid order reference.');
    const latitude = readCoordinate(req.body?.latitude, -90, 90, 'Latitude');
    const longitude = readCoordinate(req.body?.longitude, -180, 180, 'Longitude');

    const [rows] = await pool.execute(
      `SELECT d.id, d.status
         FROM deliveries d
         JOIN rider_profiles rp ON rp.id = d.rider_id
         JOIN orders o ON o.id = d.order_id
        WHERE o.public_id = ? AND rp.user_id = ?
        LIMIT 1`,
      [orderId, req.auth.user.id],
    );
    if (!rows.length) throw notFound('No delivery of yours was found for that order.');
    if (!RIDER_MAY_SHARE.includes(rows[0].status)) {
      throw conflict('You can share your location only while this delivery is in progress.');
    }

    await pool.execute(
      `INSERT INTO delivery_live_locations (delivery_id, latitude, longitude)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), updated_at = CURRENT_TIMESTAMP(3)`,
      [rows[0].id, latitude, longitude],
    );
    return ok(res, { shared: true });
  });

  // GET /tracking/customer/orders/:id/tracking  ->  { status, location | null }
  router.get('/customer/orders/:id/tracking', requireRole('customer'), async (req, res) => {
    if (!validId.test(req.params.id)) throw badRequest('Invalid order reference.');

    const [rows] = await pool.execute(
      `SELECT d.id AS deliveryId, d.status
         FROM orders o
         LEFT JOIN deliveries d ON d.order_id = o.id
        WHERE o.public_id = ? AND o.user_id = ?
        LIMIT 1`,
      [req.params.id, req.auth.user.id],
    );
    if (!rows.length) throw notFound('Order not found.');

    const { deliveryId, status } = rows[0];
    if (!deliveryId) return ok(res, { status: 'pending_assignment', location: null });
    if (!CUSTOMER_MAY_SEE.includes(status)) return ok(res, { status, location: null });

    const [points] = await pool.execute(
      'SELECT latitude, longitude, updated_at AS updatedAt FROM delivery_live_locations WHERE delivery_id = ? LIMIT 1',
      [deliveryId],
    );
    const location = points.length
      ? { latitude: Number(points[0].latitude), longitude: Number(points[0].longitude), updatedAt: points[0].updatedAt }
      : null;
    return ok(res, { status, location });
  });

  return router;
}