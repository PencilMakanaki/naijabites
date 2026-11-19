ALTER TABLE customer_addresses
  ADD COLUMN latitude DECIMAL(10,7) NULL AFTER landmark,
  ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude,
  ADD CONSTRAINT ck_customer_addresses_coordinate_pair
    CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  ADD CONSTRAINT ck_customer_addresses_latitude
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT ck_customer_addresses_longitude
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD KEY ix_customer_addresses_coordinates (latitude, longitude);
