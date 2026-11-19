DROP TABLE branch_product_inventory;
ALTER TABLE products DROP KEY uq_products_vendor_id;
ALTER TABLE vendor_branches DROP KEY uq_vendor_branches_vendor_id;
