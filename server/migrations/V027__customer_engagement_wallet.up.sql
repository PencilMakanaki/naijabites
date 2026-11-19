CREATE TABLE product_reviews (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 public_id CHAR(26) NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 order_item_id BIGINT UNSIGNED NULL,
 rating TINYINT UNSIGNED NOT NULL,
 title VARCHAR(120) NULL,
 body VARCHAR(1500) NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'published',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_product_reviews_public_id(public_id),
 UNIQUE KEY uq_product_reviews_user_item(user_id,order_item_id),
 KEY ix_product_reviews_product_status(product_id,status,created_at),
 CONSTRAINT fk_product_reviews_product FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT,
 CONSTRAINT fk_product_reviews_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT fk_product_reviews_order_item FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
 CONSTRAINT ck_product_reviews_rating CHECK(rating BETWEEN 1 AND 5),
 CONSTRAINT ck_product_reviews_status CHECK(status IN ('published','hidden','flagged'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE user_notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 public_id CHAR(26) NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 notification_type VARCHAR(50) NOT NULL,
 title VARCHAR(160) NOT NULL,
 message VARCHAR(1000) NOT NULL,
 payload JSON NULL,
 read_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_user_notifications_public_id(public_id),
 KEY ix_user_notifications_user_read(user_id,read_at,created_at),
 CONSTRAINT fk_user_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE customer_wallets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 user_id BIGINT UNSIGNED NOT NULL,
 balance_kobo BIGINT UNSIGNED NOT NULL DEFAULT 0,
 currency CHAR(3) NOT NULL DEFAULT 'NGN',
 status VARCHAR(20) NOT NULL DEFAULT 'active',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_customer_wallets_user(user_id),
 CONSTRAINT fk_customer_wallets_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_customer_wallets_status CHECK(status IN ('active','frozen','closed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE wallet_transactions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 public_id CHAR(26) NOT NULL,
 wallet_id BIGINT UNSIGNED NOT NULL,
 transaction_type VARCHAR(24) NOT NULL,
 amount_kobo BIGINT UNSIGNED NOT NULL,
 balance_before_kobo BIGINT UNSIGNED NOT NULL,
 balance_after_kobo BIGINT UNSIGNED NOT NULL,
 reference VARCHAR(120) NOT NULL,
 description VARCHAR(255) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_wallet_transactions_public_id(public_id),
 UNIQUE KEY uq_wallet_transactions_reference(reference), KEY ix_wallet_transactions_wallet(wallet_id,created_at),
 CONSTRAINT fk_wallet_transactions_wallet FOREIGN KEY(wallet_id) REFERENCES customer_wallets(id) ON DELETE RESTRICT,
 CONSTRAINT ck_wallet_transactions_type CHECK(transaction_type IN ('credit','debit','refund','adjustment')),
 CONSTRAINT ck_wallet_transactions_amount CHECK(amount_kobo > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
