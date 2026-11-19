CREATE TABLE stock_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  order_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,

  quantity INT UNSIGNED NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'active',

  expires_at DATETIME(3) NOT NULL,

  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  UNIQUE KEY uq_stock_reservations_order_item (order_item_id),

  KEY ix_stock_reservations_product_status_expiry
    (product_id, status, expires_at),

  KEY ix_stock_reservations_order (order_id),

  KEY ix_stock_reservations_expiry
    (status, expires_at),

  CONSTRAINT fk_stock_reservations_order
    FOREIGN KEY (order_id)
    REFERENCES orders (id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_stock_reservations_order_item
    FOREIGN KEY (order_item_id)
    REFERENCES order_items (id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_stock_reservations_product
    FOREIGN KEY (product_id)
    REFERENCES products (id)
    ON DELETE RESTRICT,

  CONSTRAINT ck_stock_reservations_quantity
    CHECK (quantity BETWEEN 1 AND 50),

  CONSTRAINT ck_stock_reservations_status
    CHECK (status IN (
      'active',
      'consumed',
      'released',
      'expired'
    ))

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;