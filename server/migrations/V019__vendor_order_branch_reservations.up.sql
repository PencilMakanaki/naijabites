ALTER TABLE vendor_orders
  ADD COLUMN fulfilment_branch_id BIGINT UNSIGNED NULL AFTER vendor_id,
  ADD KEY ix_vendor_orders_vendor_branch (vendor_id, fulfilment_branch_id),
  ADD CONSTRAINT fk_vendor_orders_fulfilment_branch
    FOREIGN KEY (vendor_id, fulfilment_branch_id)
    REFERENCES vendor_branches (vendor_id, id) ON DELETE RESTRICT;

ALTER TABLE stock_reservations
  ADD COLUMN vendor_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD COLUMN branch_id BIGINT UNSIGNED NULL AFTER vendor_id;

UPDATE stock_reservations sr
JOIN products p ON p.id = sr.product_id
SET sr.vendor_id = p.vendor_id;

ALTER TABLE stock_reservations
  MODIFY COLUMN vendor_id BIGINT UNSIGNED NOT NULL,
  ADD KEY ix_stock_reservations_vendor_branch (vendor_id, branch_id),
  ADD CONSTRAINT fk_stock_reservations_vendor_branch
    FOREIGN KEY (vendor_id, branch_id)
    REFERENCES vendor_branches (vendor_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_reservations_vendor_product
    FOREIGN KEY (vendor_id, product_id)
    REFERENCES products (vendor_id, id) ON DELETE RESTRICT;
