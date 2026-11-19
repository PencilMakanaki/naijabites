CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL,

  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',

  recipient_name VARCHAR(80) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  address_line1 VARCHAR(200) NOT NULL,
  address_line2 VARCHAR(200) NULL,
  area VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  landmark VARCHAR(160) NULL,
  delivery_instructions VARCHAR(500) NULL,

  delivery_zone_id BIGINT UNSIGNED NULL,
  delivery_zone_name VARCHAR(100) NOT NULL,

  subtotal_kobo BIGINT UNSIGNED NOT NULL,
  delivery_fee_kobo BIGINT UNSIGNED NOT NULL,
  total_kobo BIGINT UNSIGNED NOT NULL,

  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  UNIQUE KEY uq_orders_public_id (public_id),
  UNIQUE KEY uq_orders_user_idempotency (user_id, idempotency_key),

  KEY ix_orders_user_created (user_id, created_at),
  KEY ix_orders_status (status),

  CONSTRAINT fk_orders_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,

  CONSTRAINT fk_orders_delivery_zone
    FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones (id) ON DELETE SET NULL,

  CONSTRAINT ck_orders_status
    CHECK (status IN (
      'pending_payment',
      'confirmed',
      'processing',
      'ready_for_dispatch',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )),

  CONSTRAINT ck_orders_payment_status
    CHECK (payment_status IN (
      'unpaid',
      'pending',
      'paid',
      'failed',
      'refunded'
    )),

  CONSTRAINT ck_orders_total
    CHECK (total_kobo = subtotal_kobo + delivery_fee_kobo),

  CONSTRAINT ck_orders_amount_limit
    CHECK (
      subtotal_kobo <= 9007199254740991
      AND delivery_fee_kobo <= 9007199254740991
      AND total_kobo <= 9007199254740991
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE vendor_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,

  order_id BIGINT UNSIGNED NOT NULL,
  vendor_id BIGINT UNSIGNED NOT NULL,

  vendor_name VARCHAR(120) NOT NULL,

  status VARCHAR(30) NOT NULL DEFAULT 'pending',

  subtotal_kobo BIGINT UNSIGNED NOT NULL,
  commission_bps SMALLINT UNSIGNED NOT NULL,
  commission_kobo BIGINT UNSIGNED NOT NULL,
  vendor_earnings_kobo BIGINT UNSIGNED NOT NULL,

  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  UNIQUE KEY uq_vendor_orders_public_id (public_id),
  UNIQUE KEY uq_vendor_orders_order_vendor (order_id, vendor_id),

  KEY ix_vendor_orders_vendor_status (vendor_id, status),
  KEY ix_vendor_orders_order (order_id),

  CONSTRAINT fk_vendor_orders_order
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,

  CONSTRAINT fk_vendor_orders_vendor
    FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE RESTRICT,

  CONSTRAINT ck_vendor_orders_status
    CHECK (status IN (
      'pending',
      'accepted',
      'preparing',
      'ready',
      'completed',
      'cancelled'
    )),

  CONSTRAINT ck_vendor_orders_commission
    CHECK (commission_bps <= 10000),

  CONSTRAINT ck_vendor_orders_earnings
    CHECK (vendor_earnings_kobo + commission_kobo = subtotal_kobo),

  CONSTRAINT ck_vendor_orders_amount_limit
    CHECK (
      subtotal_kobo <= 9007199254740991
      AND commission_kobo <= 9007199254740991
      AND vendor_earnings_kobo <= 9007199254740991
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  vendor_order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,

  product_public_id CHAR(26) NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  vendor_name VARCHAR(120) NOT NULL,

  unit VARCHAR(30) NOT NULL,
  quantity TINYINT UNSIGNED NOT NULL,

  unit_price_kobo BIGINT UNSIGNED NOT NULL,
  line_total_kobo BIGINT UNSIGNED NOT NULL,

  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  KEY ix_order_items_vendor_order (vendor_order_id),
  KEY ix_order_items_product (product_id),

  CONSTRAINT fk_order_items_vendor_order
    FOREIGN KEY (vendor_order_id)
    REFERENCES vendor_orders (id) ON DELETE RESTRICT,

  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE RESTRICT,

  CONSTRAINT ck_order_items_quantity
    CHECK (quantity BETWEEN 1 AND 50),

  CONSTRAINT ck_order_items_total
    CHECK (line_total_kobo = unit_price_kobo * quantity),

  CONSTRAINT ck_order_items_amount_limit
    CHECK (
      unit_price_kobo <= 9007199254740991
      AND line_total_kobo <= 9007199254740991
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;