
-- SQLite twin of migration V006 (plus the two user tables the seed needs).
-- Test use only.
-- A test checks that its column names match the real MySQL migration.

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    email_verified_at TEXT,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE markets (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_label TEXT NOT NULL,
    heading TEXT NOT NULL,
    blurb TEXT,
    icon TEXT NOT NULL,
    is_main INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    owner_user_id INTEGER NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    description TEXT,
    logo_key TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    approved_by INTEGER,
    approved_at TEXT,
    commission_bps INTEGER,
    accepts_reservations INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);

CREATE TABLE vendor_branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address_line TEXT NOT NULL,
    area TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Lagos',
    phone TEXT,
    latitude REAL,
    longitude REAL,
    is_active INTEGER NOT NULL DEFAULT 1,
    opening_hours TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    vendor_id INTEGER NOT NULL,
    category_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    price_kobo INTEGER NOT NULL,
    unit TEXT NOT NULL DEFAULT 'item',
    fulfilment_mode TEXT NOT NULL DEFAULT 'standard',
    is_published INTEGER NOT NULL DEFAULT 0,
    is_available INTEGER NOT NULL DEFAULT 1,
    moderation_status TEXT NOT NULL DEFAULT 'ok',
    track_stock INTEGER NOT NULL DEFAULT 0,
    stock_on_hand INTEGER,
    max_per_order INTEGER NOT NULL DEFAULT 20,
    badge TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);

CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    storage_key TEXT,
    external_url TEXT,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE product_markets (
    product_id INTEGER NOT NULL,
    market_code TEXT NOT NULL,
    PRIMARY KEY (product_id, market_code)
);
