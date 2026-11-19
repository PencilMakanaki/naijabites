ALTER TABLE orders
  ADD COLUMN delivery_latitude DECIMAL(10,7) NULL AFTER delivery_instructions,
  ADD COLUMN delivery_longitude DECIMAL(10,7) NULL AFTER delivery_latitude,
  ADD CONSTRAINT ck_orders_delivery_coordinate_pair
    CHECK ((delivery_latitude IS NULL AND delivery_longitude IS NULL) OR (delivery_latitude IS NOT NULL AND delivery_longitude IS NOT NULL)),
  ADD CONSTRAINT ck_orders_delivery_latitude
    CHECK (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT ck_orders_delivery_longitude
    CHECK (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180);
