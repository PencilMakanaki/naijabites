CREATE TABLE delivery_zones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  zone_name VARCHAR(100) NOT NULL,
  state VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  area VARCHAR(80) NOT NULL DEFAULT '',
  fee_kobo BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_zones_public_id (public_id),
  UNIQUE KEY uq_delivery_zones_location (state, city, area),
  KEY ix_delivery_zones_status (status),
  KEY ix_delivery_zones_location_status (state, city, status),

  CONSTRAINT fk_delivery_zones_created_by
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,

  CONSTRAINT fk_delivery_zones_updated_by
    FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,

  CONSTRAINT ck_delivery_zones_status
    CHECK (status IN ('active', 'inactive')),

  CONSTRAINT ck_delivery_zones_fee
    CHECK (fee_kobo <= 9007199254740991),

  CONSTRAINT ck_delivery_zones_name
    CHECK (CHAR_LENGTH(TRIM(zone_name)) >= 2),

  CONSTRAINT ck_delivery_zones_state
    CHECK (CHAR_LENGTH(TRIM(state)) >= 2),

  CONSTRAINT ck_delivery_zones_city
    CHECK (CHAR_LENGTH(TRIM(city)) >= 2)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;