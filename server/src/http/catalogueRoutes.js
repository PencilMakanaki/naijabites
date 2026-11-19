import { Router } from 'express';
import { productIdParam, productsQuery, suggestQuery, vendorSlugParam, vendorsQuery } from '../catalogue/schemas.js';
import { notFound } from './errors.js';
import { ok } from './respond.js';
import { fieldsFrom } from './validate.js';
import { validationFailed } from './errors.js';

function parseQuery(schema, req) {
  const result = schema.safeParse(req.query);
  if (!result.success) throw validationFailed(fieldsFrom(result.error));
  return result.data;
}

/** Public, read-only storefront data. */
export function catalogueRoutes({ catalogue }) {
  const router = Router();

  router.get('/markets', async (req, res) => ok(res, await catalogue.listMarkets()));
  router.get('/categories', async (req, res) => ok(res, await catalogue.listCategories()));

  router.get('/products', async (req, res) => {
    const filters = parseQuery(productsQuery, req);
    const { items, nextCursor } = await catalogue.listProducts(filters);
    ok(res, items, { nextCursor });
  });

  router.get('/products/:id', async (req, res) => {
    const id = productIdParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const product = await catalogue.getProduct(id.data);
    if (!product) throw notFound();
    ok(res, product);
  });

  router.get('/vendors', async (req, res) => ok(res, await catalogue.listVendors(parseQuery(vendorsQuery, req))));

  router.get('/vendors/:slug', async (req, res) => {
    const slug = vendorSlugParam.safeParse(req.params.slug);
    if (!slug.success) throw notFound();
    const vendor = await catalogue.getVendor(slug.data);
    if (!vendor) throw notFound();
    ok(res, vendor);
  });

  router.get('/search/suggest', async (req, res) => ok(res, await catalogue.suggest(parseQuery(suggestQuery, req).q)));

  return router;
}
