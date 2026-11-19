ALTER TABLE vendor_orders
  ADD COLUMN delivery_distance_meters INT UNSIGNED NULL AFTER fulfilment_branch_id,
  ADD COLUMN delivery_weight_grams BIGINT UNSIGNED NULL AFTER delivery_distance_meters,
  ADD COLUMN delivery_quote_kobo BIGINT UNSIGNED NULL AFTER delivery_weight_grams,
  ADD COLUMN delivery_quote_source VARCHAR(30) NULL AFTER delivery_quote_kobo,
  ADD COLUMN delivery_quote_calculated_at DATETIME(3) NULL AFTER delivery_quote_source,
  ADD CONSTRAINT ck_vendor_orders_delivery_quote_source
    CHECK (delivery_quote_source IS NULL OR delivery_quote_source IN ('flat_rate', 'google_routes', 'fallback'));

INSERT INTO platform_settings (setting_key, value, description) VALUES
 ('delivery_pricing_mode', CAST('\"flat_rate\"' AS JSON), 'Delivery pricing mode: flat_rate or distance_weight. Flat rate remains the checkout default.'),
 ('delivery_base_fee_kobo', CAST('0' AS JSON), 'Base delivery fee in kobo for distance/weight pricing.'),
 ('delivery_per_km_kobo', CAST('0' AS JSON), 'Delivery fee per started kilometre in kobo.'),
 ('delivery_per_kg_kobo', CAST('0' AS JSON), 'Delivery fee per started kilogram in kobo.'),
 ('delivery_min_fee_kobo', CAST('0' AS JSON), 'Minimum calculated delivery fee in kobo.'),
 ('delivery_max_fee_kobo', CAST('9007199254740991' AS JSON), 'Maximum calculated delivery fee in kobo.'),
 ('delivery_distance_fallback', CAST('true' AS JSON), 'Whether to use configured fallback when road routing is unavailable.')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
