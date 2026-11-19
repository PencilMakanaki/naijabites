CREATE TABLE platform_incidents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 public_id CHAR(26) NOT NULL,
 severity VARCHAR(16) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'open',
 title VARCHAR(180) NOT NULL,
 description TEXT NULL,
 opened_by BIGINT UNSIGNED NULL,
 assigned_to BIGINT UNSIGNED NULL,
 resolved_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_platform_incidents_public_id(public_id),
 KEY ix_platform_incidents_status_severity(status,severity,created_at),
 CONSTRAINT fk_platform_incidents_opener FOREIGN KEY(opened_by) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT fk_platform_incidents_assignee FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_platform_incidents_severity CHECK(severity IN ('low','medium','high','critical')),
 CONSTRAINT ck_platform_incidents_status CHECK(status IN ('open','investigating','resolved','closed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE platform_feature_flags (
 flag_key VARCHAR(100) NOT NULL,
 is_enabled TINYINT(1) NOT NULL DEFAULT 0,
 config_json JSON NULL,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(flag_key),
 CONSTRAINT fk_platform_feature_flags_user FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO platform_feature_flags(flag_key,is_enabled) VALUES
 ('customer_wallet',0),('product_reviews',1),('rider_dispatch',0),('loyalty_rewards',0),('ai_recommendations',0)
ON DUPLICATE KEY UPDATE flag_key=VALUES(flag_key);
