CREATE TABLE order_cancellation_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 public_id CHAR(26) NOT NULL,
 order_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 reason VARCHAR(500) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 reviewed_by BIGINT UNSIGNED NULL,
 review_note VARCHAR(500) NULL,
 requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 reviewed_at DATETIME(3) NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_order_cancellation_requests_public_id(public_id),
 UNIQUE KEY uq_order_cancellation_requests_order(order_id),
 KEY ix_order_cancellation_requests_status(status,requested_at),
 CONSTRAINT fk_order_cancellation_requests_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT,
 CONSTRAINT fk_order_cancellation_requests_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT fk_order_cancellation_requests_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_order_cancellation_requests_status CHECK(status IN ('pending','approved','rejected','withdrawn'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
