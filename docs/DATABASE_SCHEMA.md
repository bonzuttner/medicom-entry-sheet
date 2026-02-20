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

## 9. バリデーション一覧（DB制約 + API実装）

ここでは「DBが強制する制約」と「API/画面で追加実装している入力チェック」を分けて記載する。

### 9.1 `users`

- DB制約:
  - `username`: `NOT NULL`, `UNIQUE`, `VARCHAR(100)`
  - `password_hash`: `NOT NULL`, `VARCHAR(255)`
  - `display_name`: `NOT NULL`, `VARCHAR(200)`
  - `manufacturer_id`: `NOT NULL`, `FK`
  - `email`: `NOT NULL`, `VARCHAR(255)`
  - `role`: `CHECK (role IN ('ADMIN', 'STAFF'))`
- API/画面バリデーション:
  - パスワード: 大文字/小文字/数字/記号を含む8文字以上
  - メール: 一般的なメール形式
  - 電話番号: ハイフンなし半角数字10〜11桁
  - 最後の `ADMIN` ユーザーは削除不可

### 9.2 `entry_sheets`

- DB制約:
  - `creator_id`: `NOT NULL`, `FK`
  - `manufacturer_id`: `NOT NULL`, `FK`
  - `title`: `NOT NULL`, `VARCHAR(500)`
  - `status`: `CHECK (status IN ('draft', 'completed'))`
- APIバリデーション:
  - テキスト系項目は最大4000文字
    - `title`, `notes`, `email`, `phoneNumber`
  - `products` は1件以上必須

### 9.3 `product_entries`

- DB制約:
  - `sheet_id`: `NOT NULL`, `FK`
  - `manufacturer_id`: `NOT NULL`, `FK`
  - `shelf_name`: `NOT NULL`, `VARCHAR(200)`
  - `jan_code`: `NOT NULL`, `VARCHAR(50)`
  - `product_name`: `NOT NULL`, `VARCHAR(500)`
  - `has_promo_material`: `NOT NULL`, `BOOLEAN`
- API/画面バリデーション:
  - JANコード:
    - 全角数字は半角へ正規化
    - `completed` 保存時は 8/13/16 桁のみ許可
  - テキスト系項目は最大4000文字
    - `shelf_name`, `product_name`, `jan_code`, `catch_copy`, `product_message`, `product_notes`, `promo_sample`, `special_fixture`
  - `completed` 保存時:
    - `product_name` / `jan_code` / `product_image` は必須
    - 販促物ありの場合 `promo_width` と `promo_image` は必須

### 9.4 `product_ingredients`

- DB制約:
  - `product_id`: `NOT NULL`, `FK`
  - `ingredient_name`: `NOT NULL`, `VARCHAR(200)`
  - `UNIQUE (product_id, ingredient_name)`（同一商品で重複禁止）

### 9.5 `attachments`

- DB制約:
  - `name`: `NOT NULL`, `VARCHAR(500)`
  - `size`: `NOT NULL`, `BIGINT`
  - `type`: `NOT NULL`, `VARCHAR(100)`
  - `url`: `NOT NULL`, `TEXT`
  - `CHECK`: `sheet_id` と `product_id` はどちらか一方のみ指定
- API/画面バリデーション:
  - 添付ファイル: 25MB以下、許可MIMEのみ
  - 画像:
    - 50MB以下
    - 短辺1500px未満はエラー
    - 許可MIMEのみ（JPEG/PNG/WebP/GIF/BMP）

### 9.6 `master_data`

- DB制約:
  - `UNIQUE (category, value)`
- APIバリデーション:
  - マスタ値は20文字以内
  - 対象カテゴリ: メーカー名 / 棚割名 / リスク分類 / 特定成分

## 10. 参照先

- スキーマ本体: `api/admin/schema.sql`
- Repository実装:
  - `api/_lib/repositories/users.ts`
  - `api/_lib/repositories/sheets.ts`
  - `api/_lib/repositories/masters.ts`
- 主要バリデーション実装:
  - `api/users/[id].ts`
  - `api/sheets/[id].ts`
  - `api/master.ts`
  - `api/_lib/media.ts`
  - `src/components/EntryForm.tsx`
