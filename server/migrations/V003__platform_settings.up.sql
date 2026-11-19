CREATE TABLE platform_settings (
  setting_key VARCHAR(60) NOT NULL,
  value JSON NOT NULL,
  description VARCHAR(255) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_platform_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A JSON null means "not decided yet". The launch checklist blocks going live until the first two are set.
INSERT INTO platform_settings (setting_key, value, description) VALUES
  ('commission_default_bps', CAST('null' AS JSON), 'Default platform commission in basis points (1000 = 10%). Must be set before launch.'),
  ('delivery_fee_flat_kobo', CAST('null' AS JSON), 'Delivery fee per delivery in kobo. Must be set before checkout is opened to customers.'),
  ('vendor_accept_minutes', CAST('10' AS JSON), 'Minutes a vendor has to accept or reject a new order.'),
  ('stock_hold_minutes', CAST('15' AS JSON), 'Minutes stock is held for an unpaid order before it is released.'),
  ('delivery_code_length', CAST('4' AS JSON), 'Number of digits in the delivery confirmation code.');
