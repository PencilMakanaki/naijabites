ALTER TABLE products
  ADD COLUMN weight_grams INT UNSIGNED NULL AFTER unit;
ALTER TABLE order_items
  ADD COLUMN unit_weight_grams INT UNSIGNED NULL AFTER unit_price_kobo;
