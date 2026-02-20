# データベース項目説明（PostgreSQL / Neon）

本システムのDBスキーマ本体は `api/admin/schema.sql` です。
このドキュメントは主要テーブルと項目の意味を簡潔にまとめたものです。

## 1. `manufacturers`

- 目的: メーカー名の正規化
- 主キー: `id (UUID)`
- 主項目:
  - `name`: メーカー名（ユニーク）
  - `created_at`: 作成日時

## 2. `users`

- 目的: ログインユーザー管理
- 主キー: `id (UUID)`
- 外部キー:
  - `manufacturer_id -> manufacturers.id`
- 主項目:
  - `username`: ログインID（ユニーク）
  - `password_hash`: ハッシュ済みパスワード（`scrypt$...`）
  - `display_name`: 表示名
  - `email`, `phone_number`: 連絡先
  - `role`: `ADMIN` / `STAFF`
  - `created_at`, `updated_at`

## 3. `entry_sheets`

- 目的: エントリーシート（ヘッダ）
- 主キー: `id (UUID)`
- 外部キー:
  - `creator_id -> users.id`
  - `manufacturer_id -> manufacturers.id`
- 主項目:
  - `title`: シートタイトル
  - `notes`: 補足情報
  - `status`: `draft` / `completed`
  - `created_at`, `updated_at`

## 4. `product_entries`

- 目的: シート配下の商品明細
- 主キー: `id (UUID)`
- 外部キー:
  - `sheet_id -> entry_sheets.id`
  - `manufacturer_id -> manufacturers.id`
- 主項目:
  - `shelf_name`, `jan_code`, `product_name`
  - `product_image_url`
  - `risk_classification`
  - `catch_copy`, `product_message`, `product_notes`
  - `width`, `height`, `depth`, `facing_count`
  - `arrival_date`
  - `has_promo_material`
  - `promo_*`（販促物情報）
  - `created_at`, `updated_at`

## 5. `product_ingredients`

- 目的: 商品と特定成分の多対多管理
- 主キー: `id (UUID)`
- 外部キー:
  - `product_id -> product_entries.id`
- 主項目:
  - `ingredient_name`
- 制約:
  - `UNIQUE (product_id, ingredient_name)`

## 6. `attachments`

- 目的: シート/商品の添付ファイル
- 主キー: `id (UUID)`
- 外部キー:
  - `sheet_id -> entry_sheets.id`（シート添付）
  - `product_id -> product_entries.id`（商品添付）
- 主項目:
  - `name`, `size`, `type`, `url`, `created_at`
- 制約:
  - `sheet_id` と `product_id` はどちらか一方のみ必須

## 7. `master_data`

- 目的: マスタ値管理（メーカー名、棚割名、リスク分類、特定成分）
- 主キー: `id (UUID)`
- 主項目:
  - `category`
  - `value`
  - `display_order`
  - `created_at`
- 制約:
  - `UNIQUE (category, value)`

`category` の実運用値:
- `manufacturer_name` -> `manufacturerNames`
- `shelf_name` -> `shelfNames`
- `risk_classification` -> `riskClassifications`
- `specific_ingredient` -> `specificIngredients`

## 8. インデックス補足

- 一覧・絞り込み高速化のために `manufacturer_id` / `status` / `created_at` 等へインデックスを付与
- `entry_sheets` は `manufacturer_id, updated_at DESC` の複合インデックスを利用

## 9. 参照先

- スキーマ本体: `api/admin/schema.sql`
- Repository実装:
  - `api/_lib/repositories/users.ts`
  - `api/_lib/repositories/sheets.ts`
  - `api/_lib/repositories/masters.ts`
