CREATE TABLE payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  public_id CHAR(26) NOT NULL,

  order_id BIGINT UNSIGNED NOT NULL,

  provider VARCHAR(20) NOT NULL DEFAULT 'paystack',

  reference VARCHAR(100) NOT NULL,

  authorization_url VARCHAR(2048) NULL,

  provider_transaction_id BIGINT UNSIGNED NULL,

  amount_kobo BIGINT UNSIGNED NOT NULL,

  currency CHAR(3) NOT NULL DEFAULT 'NGN',

  status VARCHAR(20) NOT NULL DEFAULT 'initializing',

  gateway_response VARCHAR(255) NULL,

  failure_reason VARCHAR(500) NULL,

  paid_at DATETIME(3) NULL,

  verified_at DATETIME(3) NULL,

  created_at DATETIME(3) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(3),

  updated_at DATETIME(3) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),

  UNIQUE KEY uq_payment_transactions_public_id (public_id),

  UNIQUE KEY uq_payment_transactions_reference (reference),

  UNIQUE KEY uq_payment_transactions_provider_transaction (
    provider,
    provider_transaction_id
  ),

  KEY ix_payment_transactions_order_status (
    order_id,
    status
  ),

  KEY ix_payment_transactions_created (created_at),

  CONSTRAINT fk_payment_transactions_order
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_payment_transactions_provider
    CHECK (provider = 'paystack'),

  CONSTRAINT chk_payment_transactions_status
    CHECK (
      status IN (
        'initializing',
        'initialized',
        'success',
        'failed',
        'abandoned'
      )
    ),

  CONSTRAINT chk_payment_transactions_amount
    CHECK (amount_kobo > 0),

  CONSTRAINT chk_payment_transactions_currency
    CHECK (currency = 'NGN')

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;