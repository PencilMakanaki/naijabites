CREATE TABLE markets (
  code VARCHAR(30) NOT NULL,
  name VARCHAR(60) NOT NULL,
  short_label VARCHAR(80) NOT NULL,
  heading VARCHAR(80) NOT NULL,
  blurb VARCHAR(120) NULL,
  icon VARCHAR(16) NOT NULL,
  is_main TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (code),
  KEY ix_markets_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO markets (code, name, short_label, heading, blurb, icon, is_main, sort_order) VALUES
  ('breakfast', 'Cafés & Bakeries', 'Coffee, bread & pastries', 'Cafés & Bakeries Near You', 'Coffee, bread, cakes & pastries', '☕', 1, 1),
  ('lunch', 'Fast Food', 'Quick meals & takeaway', 'Fast Food Near You', 'Burgers, shawarma, pizza & more', '🍔', 1, 2),
  ('dinner', 'Dining', 'Restaurant menus', 'Dining Menus Near You', 'Restaurant meals & menus', '🍽️', 1, 3),
  ('buka', 'Buka (Mama Put)', 'Local favourites', 'Buka Favourites', NULL, '🍲', 0, 4),
  ('groceries', 'Groceries', 'Farm foods & store provisions', 'Groceries & Store Provisions', NULL, '🛒', 0, 5),
  ('livestock', 'Livestock', 'Live farm animals', 'Live Animals for Sale', NULL, '🐄', 0, 6);

CREATE TABLE categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NULL,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(80) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY ix_categories_parent (parent_id),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vendors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  business_name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  contact_name VARCHAR(80) NULL,
  contact_email VARCHAR(254) NULL,
  contact_phone VARCHAR(20) NULL,
  description VARCHAR(1000) NULL,
  logo_key VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500) NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  commission_bps SMALLINT UNSIGNED NULL,
  accepts_reservations TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vendors_public_id (public_id),
  UNIQUE KEY uq_vendors_owner (owner_user_id),
  UNIQUE KEY uq_vendors_slug (slug),
  KEY ix_vendors_status (status),
  CONSTRAINT fk_vendors_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_vendors_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT ck_vendors_status CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  CONSTRAINT ck_vendors_commission CHECK (commission_bps IS NULL OR commission_bps <= 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE vendor_branches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  address_line VARCHAR(200) NOT NULL,
  area VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL DEFAULT 'Lagos',
  phone VARCHAR(20) NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  opening_hours JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_vendor_branches_vendor (vendor_id),
  KEY ix_vendor_branches_city (city, is_active),
  KEY ix_vendor_branches_geo (latitude, longitude),
  CONSTRAINT fk_vendor_branches_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(26) NOT NULL,
  vendor_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  price_kobo BIGINT UNSIGNED NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'item',
  fulfilment_mode VARCHAR(20) NOT NULL DEFAULT 'standard',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'ok',
  track_stock TINYINT(1) NOT NULL DEFAULT 0,
  stock_on_hand INT UNSIGNED NULL,
  max_per_order TINYINT UNSIGNED NOT NULL DEFAULT 20,
  badge VARCHAR(20) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_public_id (public_id),
  KEY ix_products_vendor_state (vendor_id, is_published, is_available),
  KEY ix_products_category (category_id),
  KEY ix_products_price (price_kobo, id),
  FULLTEXT KEY ft_products_search (name, description),
  CONSTRAINT fk_products_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (id) ON DELETE RESTRICT,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
  CONSTRAINT ck_products_price CHECK (price_kobo > 0),
  CONSTRAINT ck_products_fulfilment CHECK (fulfilment_mode IN ('standard', 'quote_required')),
  CONSTRAINT ck_products_moderation CHECK (moderation_status IN ('ok', 'hidden_by_admin')),
  CONSTRAINT ck_products_badge CHECK (badge IS NULL OR badge IN ('new', 'popular', 'celebration')),
  CONSTRAINT ck_products_max_per_order CHECK (max_per_order BETWEEN 1 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NULL,
  external_url VARCHAR(500) NULL,
  alt_text VARCHAR(200) NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_product_images_product (product_id, sort_order),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT ck_product_images_source CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_markets (
  product_id BIGINT UNSIGNED NOT NULL,
  market_code VARCHAR(30) NOT NULL,
  PRIMARY KEY (product_id, market_code),
  KEY ix_product_markets_market (market_code, product_id),
  CONSTRAINT fk_product_markets_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_markets_market FOREIGN KEY (market_code) REFERENCES markets (code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
