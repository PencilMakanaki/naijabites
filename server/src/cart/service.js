import { withTransaction } from '../db/pool.js';
import { AppError, notFound } from '../http/errors.js';

const PRODUCT_VISIBLE = `p.is_published = 1
  AND p.is_available = 1
  AND p.moderation_status = 'ok'
  AND p.fulfilment_mode = 'standard'
  AND p.deleted_at IS NULL
  AND v.status = 'approved'
  AND v.deleted_at IS NULL`;

const AVAILABLE_STOCK_SQL = `
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM branch_product_inventory bi_any
      WHERE bi_any.vendor_id = p.vendor_id
        AND bi_any.product_id = p.id
    )
    THEN CASE
      WHEN EXISTS (
        SELECT 1
        FROM stock_reservations sr_legacy
        WHERE sr_legacy.product_id = p.id
          AND sr_legacy.branch_id IS NULL
          AND sr_legacy.status = 'active'
          AND (
            sr_legacy.expires_at > UTC_TIMESTAMP(3)
            OR EXISTS (
              SELECT 1 FROM payment_transactions pt
              WHERE pt.order_id = sr_legacy.order_id
                AND pt.status IN ('initializing', 'initialized')
            )
          )
      ) THEN 0
      ELSE COALESCE((
      SELECT MAX(
        CASE
          WHEN bi.stock_on_hand - (
            SELECT COALESCE(SUM(sr.quantity), 0)
            FROM stock_reservations sr
            WHERE sr.product_id = p.id
              AND sr.branch_id = bi.branch_id
              AND sr.status = 'active'
              AND (
                sr.expires_at > UTC_TIMESTAMP(3)
                OR EXISTS (
                  SELECT 1 FROM payment_transactions pt
                  WHERE pt.order_id = sr.order_id
                    AND pt.status IN ('initializing', 'initialized')
                )
              )
          ) > 0
          THEN bi.stock_on_hand - (
            SELECT COALESCE(SUM(sr.quantity), 0)
            FROM stock_reservations sr
            WHERE sr.product_id = p.id
              AND sr.branch_id = bi.branch_id
              AND sr.status = 'active'
              AND (
                sr.expires_at > UTC_TIMESTAMP(3)
                OR EXISTS (
                  SELECT 1 FROM payment_transactions pt
                  WHERE pt.order_id = sr.order_id
                    AND pt.status IN ('initializing', 'initialized')
                )
              )
          )
          ELSE 0
        END
      )
      FROM branch_product_inventory bi
      JOIN vendor_branches vb ON vb.id = bi.branch_id AND vb.vendor_id = bi.vendor_id
      WHERE bi.vendor_id = p.vendor_id
        AND bi.product_id = p.id
        AND vb.is_active = 1
      ), 0)
    END
    ELSE CASE
      WHEN p.stock_on_hand - (
        SELECT COALESCE(SUM(sr.quantity), 0)
        FROM stock_reservations sr
        WHERE sr.product_id = p.id
          AND sr.branch_id IS NULL
          AND sr.status = 'active'
          AND (
            sr.expires_at > UTC_TIMESTAMP(3)
            OR EXISTS (
              SELECT 1 FROM payment_transactions pt
              WHERE pt.order_id = sr.order_id
                AND pt.status IN ('initializing', 'initialized')
            )
          )
      ) > 0
      THEN p.stock_on_hand - (
        SELECT COALESCE(SUM(sr.quantity), 0)
        FROM stock_reservations sr
        WHERE sr.product_id = p.id
          AND sr.branch_id IS NULL
          AND sr.status = 'active'
          AND (
            sr.expires_at > UTC_TIMESTAMP(3)
            OR EXISTS (
              SELECT 1 FROM payment_transactions pt
              WHERE pt.order_id = sr.order_id
                AND pt.status IN ('initializing', 'initialized')
            )
          )
      )
      ELSE 0
    END
  END
`;

function mapCart(rows) {
  const items = rows.map((row) => ({
    productId: row.product_public_id,
    name: row.product_name,
    vendor: {
      id: row.vendor_public_id,
      name: row.vendor_name,
      slug: row.vendor_slug,
    },
    image: row.image_url
      ? {
          url: row.image_url,
          alt: row.image_alt || row.product_name,
        }
      : null,
    unit: row.unit,
    quantity: Number(row.quantity),
    unitPriceKobo: Number(row.price_kobo),
    lineTotalKobo:
      Number(row.price_kobo) * Number(row.quantity),
    available: Boolean(row.is_available_now),
    maxPerOrder: Number(row.max_per_order),
  }));

  return {
    items,
    itemCount: items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    subtotalKobo: items.reduce(
      (sum, item) => sum + item.lineTotalKobo,
      0,
    ),
  };
}

async function ensureCart(connection, userId) {
  await connection.execute(
    `INSERT INTO carts (user_id)
     VALUES (?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [userId],
  );

  const [[cart]] = await connection.execute(
    'SELECT id FROM carts WHERE user_id = ? FOR UPDATE',
    [userId],
  );

  return cart.id;
}

async function readCart(executor, userId) {
  const [rows] = await executor.execute(
    `SELECT
        p.public_id AS product_public_id,
        p.name AS product_name,
        p.price_kobo,
        p.unit,
        p.max_per_order,

        CASE
          WHEN ${PRODUCT_VISIBLE}
            AND (
              p.track_stock = 0
              OR (${AVAILABLE_STOCK_SQL}) >= ci.quantity
            )
          THEN 1
          ELSE 0
        END AS is_available_now,

        ci.quantity,

        v.public_id AS vendor_public_id,
        v.business_name AS vendor_name,
        v.slug AS vendor_slug,

        COALESCE(
          pi.external_url,
          CASE
            WHEN pi.storage_key IS NOT NULL
            THEN CONCAT('/media/', pi.storage_key)
          END
        ) AS image_url,

        pi.alt_text AS image_alt

      FROM carts c

      JOIN cart_items ci
        ON ci.cart_id = c.id

      JOIN products p
        ON p.id = ci.product_id

      JOIN vendors v
        ON v.id = p.vendor_id

      LEFT JOIN product_images pi
        ON pi.id = (
          SELECT p2.id
          FROM product_images p2
          WHERE p2.product_id = p.id
          ORDER BY
            p2.is_primary DESC,
            p2.sort_order,
            p2.id
          LIMIT 1
        )

      WHERE c.user_id = ?

      ORDER BY ci.created_at, ci.id`,
    [userId],
  );

  return mapCart(rows);
}

export function createCartService({ pool }) {
  return {
    async get(userId) {
      return readCart(pool, userId);
    },

    async add(userId, productPublicId, quantity) {
      await withTransaction(pool, async (connection) => {
        const cartId = await ensureCart(connection, userId);

        const [products] = await connection.execute(
          `SELECT
              p.id,
              p.price_kobo,
              p.max_per_order,
              p.track_stock,
              (${AVAILABLE_STOCK_SQL}) AS available_stock

           FROM products p

           JOIN vendors v
             ON v.id = p.vendor_id

           WHERE p.public_id = ?
             AND ${PRODUCT_VISIBLE}

           FOR UPDATE`,
          [productPublicId],
        );

        const product = products[0];

        if (!product) {
          throw notFound(
            'This product is no longer available.',
          );
        }

        const [existingRows] = await connection.execute(
          `SELECT quantity
           FROM cart_items
           WHERE cart_id = ?
             AND product_id = ?
           FOR UPDATE`,
          [cartId, product.id],
        );

        const nextQuantity =
          Number(existingRows[0]?.quantity ?? 0) +
          quantity;

        const maxPerOrder = Number(product.max_per_order);

        let availableStock = maxPerOrder;

        if (Number(product.track_stock) === 1) {
          availableStock = Math.max(
            0,
            Number(product.available_stock ?? 0),
          );
        }

        const limit = Math.min(
          maxPerOrder,
          availableStock,
        );

        if (nextQuantity > limit) {
          throw new AppError(
            409,
            'cart_quantity_limit',
            limit === 0
              ? 'This product is out of stock.'
              : `Only ${limit} of this product can be added to your cart.`,
          );
        }

        await connection.execute(
          `INSERT INTO cart_items (
             cart_id,
             product_id,
             quantity
           )
           VALUES (?, ?, ?)

           ON DUPLICATE KEY UPDATE
             quantity = VALUES(quantity)`,
          [cartId, product.id, nextQuantity],
        );
      });

      return readCart(pool, userId);
    },

    async setQuantity(userId, productPublicId, quantity) {
      await withTransaction(pool, async (connection) => {
        const [rows] = await connection.execute(
          `SELECT
              ci.id,
              p.max_per_order,
              p.track_stock,
              p.is_available,
              p.is_published,
              p.moderation_status,
              p.fulfilment_mode,
              p.deleted_at,

              (${AVAILABLE_STOCK_SQL}) AS available_stock,

              v.status AS vendor_status,
              v.deleted_at AS vendor_deleted_at

           FROM carts c

           JOIN cart_items ci
             ON ci.cart_id = c.id

           JOIN products p
             ON p.id = ci.product_id

           JOIN vendors v
             ON v.id = p.vendor_id

           WHERE c.user_id = ?
             AND p.public_id = ?

           FOR UPDATE`,
          [userId, productPublicId],
        );

        const item = rows[0];

        if (!item) {
          throw notFound(
            'This item is not in your cart.',
          );
        }

        let availableStock = Number(item.max_per_order);

        if (Number(item.track_stock) === 1) {
          availableStock = Math.max(
            0,
            Number(item.available_stock ?? 0),
          );
        }

        if (
          quantity > Number(item.max_per_order) ||
          quantity > availableStock
        ) {
          throw new AppError(
            409,
            'cart_quantity_limit',
            'The requested quantity is no longer available.',
          );
        }

        if (
          !item.is_available ||
          !item.is_published ||
          item.moderation_status !== 'ok' ||
          item.fulfilment_mode !== 'standard' ||
          item.deleted_at ||
          item.vendor_status !== 'approved' ||
          item.vendor_deleted_at
        ) {
          throw new AppError(
            409,
            'cart_product_unavailable',
            'This product is no longer available. Remove it from your cart to continue.',
          );
        }

        await connection.execute(
          `UPDATE cart_items
           SET quantity = ?
           WHERE id = ?`,
          [quantity, item.id],
        );
      });

      return readCart(pool, userId);
    },

    async remove(userId, productPublicId) {
      await pool.execute(
        `DELETE ci
         FROM cart_items ci

         JOIN carts c
           ON c.id = ci.cart_id

         JOIN products p
           ON p.id = ci.product_id

         WHERE c.user_id = ?
           AND p.public_id = ?`,
        [userId, productPublicId],
      );

      return readCart(pool, userId);
    },

    async clear(userId) {
      await pool.execute(
        `DELETE ci
         FROM cart_items ci

         JOIN carts c
           ON c.id = ci.cart_id

         WHERE c.user_id = ?`,
        [userId],
      );

      return {
        items: [],
        itemCount: 0,
        subtotalKobo: 0,
      };
    },
  };
}