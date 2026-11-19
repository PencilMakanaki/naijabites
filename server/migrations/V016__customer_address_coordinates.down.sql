ALTER TABLE customer_addresses
  DROP KEY ix_customer_addresses_coordinates,
  DROP CHECK ck_customer_addresses_longitude,
  DROP CHECK ck_customer_addresses_latitude,
  DROP CHECK ck_customer_addresses_coordinate_pair,
  DROP COLUMN longitude,
  DROP COLUMN latitude;
