# 開発セットアップ最短手順（初見エンジニア向け）

このドキュメントは、初めてこのリポジトリを触るエンジニア向けの最短手順です。

## 1. 前提

- Node.js 18 以上
- npm 8 以上
- Vercel CLI（APIモードで動作確認する場合）

```bash
npm install -g vercel
```

## 1.1 最初に把握する場所（移行検討者向け）

1. バックエンド入口: `api/`
2. DBアクセス層: `api/_lib/repositories/`
3. DBスキーマ: `api/admin/schema.sql`
4. ストレージ依存: `api/_lib/media.ts`
5. 全体像: `docs/SYSTEM_OVERVIEW.md`

## 2. 初回セットアップ

```bash
npm install
```

## 3. 起動パターン

### A. UIのみ確認（APIなし）

```bash
npm run dev
```

- Vite の起動URL（ターミナル表示）を開く
- API は呼べないため、実運用動作確認には不向き

### B. API込み確認（本番に近い）

```bash
npm run dev:api
```

- Vercel dev の起動URL（ターミナル表示）を開く
- `api/` 配下の Functions を使って動作

## 4. APIモードの準備（推奨順）

1. プロジェクトを Vercel にリンク

```bash
vercel link
```

2. 環境変数を取得

```bash
vercel env pull .env.local
```

3. `.env.local` を確認し、必要値を補完

## 5. 環境変数サンプル

`.env.local` の例（値は環境に合わせて置換）。

```bash
# API base（通常は不要。必要時のみ設定）
VITE_API_BASE=http://127.0.0.1:3000

# Session/Auth
SESSION_SECRET=replace-with-64-char-random-string
PASSWORD_PEPPER=replace-with-random-string

# Database
POSTGRES_URL=postgres://...

# Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Optional
APP_RUNTIME_ENV=production
MEDIA_ALLOWED_HOSTS=blob.vercel-storage.com
```

補足:
- 現行実装は API 固定（`local` 切り替えなし）
- `VITE_API_BASE` 未設定時は同一オリジンを利用

## 6. DB初期化手順

### 方法A: psql

```bash
psql "$POSTGRES_URL" -f api/admin/schema.sql
```

### 方法B: Neon SQL Editor

1. Neon Console の SQL Editor を開く
2. 対象 Branch/Database を選択（通常 `main` / `neondb`）
3. `api/admin/schema.sql` のSQLを貼り付けて実行

### 作成確認SQL

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

期待テーブル:
- `manufacturers`
- `users`
- `entry_sheets`
- `product_entries`
- `product_ingredients`
- `attachments`
- `master_data`

## 7. よくある詰まりポイント

- `401 Unauthorized`
  - 再ログインしてセッションを更新
- `POSTGRES_URL` 未設定
  - `vercel env pull .env.local` を再実行
- `BLOB_READ_WRITE_TOKEN` 未設定
  - 画像/添付のアップロードAPIが失敗
- `テーブルが存在しない`
  - `schema.sql` の実行先 DB が違う（Branch/Database の選択ミス）

## 8. 移行計画のための最小確認

1. `api/sheets/[id].ts` で保存時の業務ルールを確認
2. `api/_lib/repositories/sheets.ts` で保存SQLとトランザクション境界を確認
3. `api/_lib/media.ts` で Blob 依存箇所を確認
4. `api/_lib/db.ts` で DB クライアント依存を確認
5. `docs/AWS_S3_MIGRATION_PLAN.md` で段階移行手順を確認
