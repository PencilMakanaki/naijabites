ALTER TABLE orders
  DROP CHECK ck_orders_delivery_longitude,
  DROP CHECK ck_orders_delivery_latitude,
  DROP CHECK ck_orders_delivery_coordinate_pair,
  DROP COLUMN delivery_longitude,
  DROP COLUMN delivery_latitude;
