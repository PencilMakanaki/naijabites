-- Composite unique keys allow the database to enforce that branch and product
-- belong to the same vendor (not merely that each independently exists).
ALTER TABLE vendor_branches
  ADD UNIQUE KEY uq_vendor_branches_vendor_id (vendor_id, id);
ALTER TABLE products
  ADD UNIQUE KEY uq_products_vendor_id (vendor_id, id);

CREATE TABLE branch_product_inventory (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  stock_on_hand INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_branch_product_inventory_branch_product (branch_id, product_id),
  UNIQUE KEY uq_branch_product_inventory_vendor_branch_product (vendor_id, branch_id, product_id),
  KEY ix_branch_product_inventory_vendor_product (vendor_id, product_id),
  CONSTRAINT fk_branch_product_inventory_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_product_inventory_branch FOREIGN KEY (vendor_id, branch_id) REFERENCES vendor_branches (vendor_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_product_inventory_product FOREIGN KEY (vendor_id, product_id) REFERENCES products (vendor_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
