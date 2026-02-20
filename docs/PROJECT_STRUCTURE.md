# プロジェクト構成の見方（初見エンジニア向け）

このリポジトリは、**フロントエンド** と **バックエンド** を同一リポジトリで管理する構成です。

## 1. どこがバックエンドか

- バックエンド本体: `api/`
- エンドポイント例:
  - `api/auth/login.ts`
  - `api/current-user.ts`
  - `api/sheets.ts`
  - `api/sheets/[id].ts`
  - `api/users.ts`
  - `api/users/[id].ts`
  - `api/master.ts`
  - `api/upload.ts`
- 共通ロジック: `api/_lib/`

補足:
- `api/*.ts` は Vercel Functions として実行される
- Express の `server.ts` が無くても `api/` がバックエンド

## 2. どこがフロントエンドか

- フロントエンド本体: `src/`
- 画面構成: `src/components/`
- 状態/画面遷移: `src/App.tsx`
- データアクセス: `src/services/dataService.ts`
- API呼び出し: `src/services/apiClient.ts`

## 3. DB設計はどこか

- スキーマ定義: `api/admin/schema.sql`
- DBアクセス実装:
  - `api/_lib/db.ts`
  - `api/_lib/repositories/users.ts`
  - `api/_lib/repositories/sheets.ts`
  - `api/_lib/repositories/masters.ts`
- ドキュメント: `docs/DATABASE_SCHEMA.md`

## 4. 最初に読む順番（推奨）

1. `README.md`（全体像）
2. `docs/SYSTEM_OVERVIEW.md`（構成）
3. `src/App.tsx`（画面遷移と主要状態）
4. `api/sheets.ts` / `api/sheets/[id].ts`（保存系の中核API）
5. `api/admin/schema.sql`（DBスキーマ）

## 5. 実行時の役割

- `npm run dev`: Vite（主にUI確認）
- `npm run dev:api`: Vercel Functions を含む実行
- 本番: Vercel 上で `src/` と `api/` を同居デプロイ
