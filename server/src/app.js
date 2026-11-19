import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { parseCookies } from './http/cookies.js';
import { csrfProtection } from './http/csrf.js';
import { errorHandler, notFoundHandler } from './http/errorHandler.js';
import { limiter } from './http/rateLimit.js';
import { requestId } from './http/requestId.js';
import { sessionLoader } from './http/authMiddleware.js';
import { authRoutes } from './http/authRoutes.js';
import { meRoutes } from './http/meRoutes.js';
import { ok } from './http/respond.js';
import { mountClient } from './http/staticClient.js';
import { createCatalogue } from './catalogue/queries.js';
import { catalogueRoutes } from './http/catalogueRoutes.js';
import { createMetaResolver } from './http/pageMeta.js';
import { cartRoutes } from './http/cartRoutes.js';
import { addressRoutes } from './http/addressRoutes.js';
import { checkoutRoutes } from './http/checkoutRoutes.js';
import { paymentRoutes } from './http/paymentRoutes.js';
import { deliveryRoutes } from './http/deliveryRoutes.js';
import { orderRoutes } from './http/orderRoutes.js';
import { vendorOrderRoutes } from './http/vendorOrderRoutes.js';
import { paystackWebhookRoutes } from './http/paystackWebhookRoutes.js';
import { inventoryRoutes } from './http/inventoryRoutes.js';
import { vendorProductRoutes } from './http/vendorProductRoutes.js';
import { adminDispatchRoutes, riderDeliveryRoutes } from './http/dispatchRoutes.js';
import { trackingRoutes } from './http/trackingRoutes.js';
import { vendorApplicationRoutes } from './http/vendorApplicationRoutes.js';
import { adminVendorRoutes } from './http/adminVendorRoutes.js';
import { adminRiderRoutes, riderProfileRoutes } from './http/riderRoutes.js';



// Paths (inside /api/v1) that are called by other servers, not browsers. They are protected by
// their own signature checks instead of CSRF. Empty until the Paystack webhook arrives in M3.
const CSRF_EXEMPT = [];

export function createApp({ config, logger, pool, clientDir, catalogue = createCatalogue({ pool }) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        ...(config.isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  // The Paystack webhook (M3) needs the raw body and must be mounted BEFORE this line.
  // Paystack sends signed JSON webhooks. Preserve the original raw body
// for signature verification before registering the normal JSON parser.
app.use(
  '/api/v1/webhooks/paystack',
  express.raw({
    type: 'application/json',
    limit: '100kb',
  }),
  paystackWebhookRoutes({ pool, config, logger }),
);

app.use(express.json({ limit: '100kb', strict: true }));
  app.use((req, res, next) => { req.cookies = parseCookies(req.headers.cookie); next(); });

  const api = express.Router();
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.get('/health', (req, res) => ok(res, { status: 'ok' }));
  api.get('/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      ok(res, { status: 'ready' });
    } catch (err) {
      logger.error({ err, requestId: req.id }, 'Readiness check failed');
      res.status(503).json({ error: { code: 'not_ready', message: 'The database is not reachable.', requestId: req.id } });
    }
  });

  api.use(limiter({ windowMs: 60 * 1000, limit: 300 }));
  api.use(sessionLoader({ pool, config }));
  api.use(csrfProtection({ secret: config.csrfSecret, appOrigin: config.appOrigin, exemptPaths: CSRF_EXEMPT }));
  api.use('/auth', authRoutes({ pool, config }));
  api.use('/me', meRoutes({ pool, config }));
  api.use('/me/cart', cartRoutes({ pool }));
  api.use('/me/addresses', addressRoutes({ pool }));
  api.use('/me/checkout', checkoutRoutes({ pool, config }));
  api.use('/me/checkout', paymentRoutes({ pool, config }));
  api.use('/me/orders', orderRoutes({ pool }));
  api.use('/vendor/orders', vendorOrderRoutes({ pool }));
  api.use('/vendor/inventory', inventoryRoutes({ pool }));
  api.use('/vendor/products', vendorProductRoutes({ pool }));
  api.use('/rider/deliveries', riderDeliveryRoutes({ pool }));
  api.use('/tracking', trackingRoutes({ pool }));
  api.use('/vendor-applications', vendorApplicationRoutes({ pool }));
  api.use('/riders', riderProfileRoutes({ pool }));

  // Admin delivery zone management
  api.use('/admin/delivery-zones', deliveryRoutes({ pool }));
  api.use('/admin/deliveries', adminDispatchRoutes({ pool }));
  api.use('/admin/riders', adminRiderRoutes({ pool }));
    api.use('/admin/vendors', adminVendorRoutes({ pool }));

  api.use('/', catalogueRoutes({ catalogue }));
  api.use(notFoundHandler);

  app.use('/api/v1', api);
  mountClient(app, clientDir, { resolveMeta: createMetaResolver({ catalogue, config }) });
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
