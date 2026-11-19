DELETE FROM platform_settings WHERE setting_key IN (
 'delivery_pricing_mode','delivery_base_fee_kobo','delivery_per_km_kobo',
 'delivery_per_kg_kobo','delivery_min_fee_kobo','delivery_max_fee_kobo',
 'delivery_distance_fallback'
);
ALTER TABLE vendor_orders
  DROP CHECK ck_vendor_orders_delivery_quote_source,
  DROP COLUMN delivery_quote_calculated_at,
  DROP COLUMN delivery_quote_source,
  DROP COLUMN delivery_quote_kobo,
  DROP COLUMN delivery_weight_grams,
  DROP COLUMN delivery_distance_meters;
