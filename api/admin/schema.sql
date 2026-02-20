-- PharmaPOP Entry System - PostgreSQL Schema
-- このスキーマはVercel Postgres (Neon) 用に設計されています

-- メーカーマスター（正規化）
CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ユーザー管理
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_manufacturer ON users(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- エントリーシート
CREATE TABLE IF NOT EXISTS entry_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'completed')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sheets_manufacturer ON entry_sheets(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_sheets_creator ON entry_sheets(creator_id);
CREATE INDEX IF NOT EXISTS idx_sheets_status ON entry_sheets(status);
CREATE INDEX IF NOT EXISTS idx_sheets_created_at ON entry_sheets(created_at DESC);

-- 商品エントリー
CREATE TABLE IF NOT EXISTS product_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID NOT NULL REFERENCES entry_sheets(id) ON DELETE CASCADE,
  shelf_name VARCHAR(200) NOT NULL,
  manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
  jan_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(500) NOT NULL,
  product_image_url TEXT,
  risk_classification VARCHAR(100),
  catch_copy TEXT,
  product_message TEXT,
  product_notes TEXT,
  width NUMERIC(10, 2),
  height NUMERIC(10, 2),
  depth NUMERIC(10, 2),
  facing_count INTEGER,
  arrival_date DATE,
  has_promo_material BOOLEAN NOT NULL DEFAULT FALSE,
  promo_sample TEXT,
  special_fixture TEXT,
  promo_width NUMERIC(10, 2),
  promo_height NUMERIC(10, 2),
  promo_depth NUMERIC(10, 2),
  promo_image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_sheet ON product_entries(sheet_id);
CREATE INDEX IF NOT EXISTS idx_products_jan_code ON product_entries(jan_code);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON product_entries(manufacturer_id);

-- 商品特定成分（多対多）
CREATE TABLE IF NOT EXISTS product_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES product_entries(id) ON DELETE CASCADE,
  ingredient_name VARCHAR(200) NOT NULL,
  UNIQUE (product_id, ingredient_name)
);

CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id);

-- 添付ファイル（シート・商品共通）
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id UUID REFERENCES entry_sheets(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_entries(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  size BIGINT NOT NULL,
  type VARCHAR(100) NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK ((sheet_id IS NOT NULL AND product_id IS NULL) OR
         (sheet_id IS NULL AND product_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_attachments_sheet ON attachments(sheet_id) WHERE sheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_product ON attachments(product_id) WHERE product_id IS NOT NULL;

-- マスターデータ管理
CREATE TABLE IF NOT EXISTS master_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  value VARCHAR(500) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (category, value)
);

CREATE INDEX IF NOT EXISTS idx_master_category ON master_data(category, display_order);
