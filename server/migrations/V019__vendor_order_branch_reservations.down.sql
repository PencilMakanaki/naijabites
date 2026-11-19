ALTER TABLE stock_reservations
  DROP FOREIGN KEY fk_stock_reservations_vendor_product,
  DROP FOREIGN KEY fk_stock_reservations_vendor_branch,
  DROP KEY ix_stock_reservations_vendor_branch,
  DROP COLUMN branch_id,
  DROP COLUMN vendor_id;
ALTER TABLE vendor_orders
  DROP FOREIGN KEY fk_vendor_orders_fulfilment_branch,
  DROP KEY ix_vendor_orders_vendor_branch,
  DROP COLUMN fulfilment_branch_id;
