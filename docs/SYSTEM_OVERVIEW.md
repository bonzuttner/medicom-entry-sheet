# システム構成概要（クライアント提出版）

## 1. このドキュメントの目的

- 初見エンジニアが「バックエンドはどこか」「中身がどう分かれているか」を即座に理解できること
- AWS/S3 など将来移行時に、どこを切り出せばよいか判断できること

## 2. 結論（最重要）

- バックエンドは `api/` 配下（Vercel Functions）
- フロントエンドは `src/` 配下（React + Vite）
- DBスキーマは `api/admin/schema.sql`
- DBアクセス実装は `api/_lib/repositories/*.ts`

## 3. 全体アーキテクチャ

```text
[Browser]
  React UI (src/)
      |
      | HTTPS /api/*
      v
[Vercel Functions]
  api/*.ts, api/*/*.ts
      |
      +--> auth/http/media/password/db (_lib)
      |
      +--> repositories (SQL集約)
              |
              +--> PostgreSQL (Neon)
              |
              +--> Vercel Blob (画像/添付)
```

## 4. ディレクトリ責務（バックエンド中心）

### 4.1 APIエンドポイント層（入口）

- `api/auth/login.ts`: ログイン
- `api/current-user.ts`: セッション確認 / ログアウト
- `api/sheets.ts`: シート一覧取得
- `api/sheets/[id].ts`: シート保存 / 削除
- `api/users.ts`: ユーザー一覧取得
- `api/users/[id].ts`: ユーザー保存 / 削除
- `api/master.ts`: マスタ取得 / 更新
- `api/upload.ts`: 画像・添付アップロード

役割:
- HTTP入出力
- 認証・認可
- 入力バリデーション
- Repository呼び出し

### 4.2 共通ロジック層（`api/_lib/`）

- `auth.ts`: セッションユーザー取得、ロール判定
- `http.ts`: Cookie、JSONレスポンス、共通エラー
- `db.ts`: DB接続、トランザクション
- `media.ts`: MIME/サイズ/解像度検証、Blob URL正規化
- `password.ts`: パスワードハッシュ/照合
- `repositories/`: SQLをテーブル単位で管理

### 4.3 永続化層（Repository）

- `api/_lib/repositories/users.ts`
  - `users`, `manufacturers` を操作
- `api/_lib/repositories/sheets.ts`
  - `entry_sheets`, `product_entries`, `product_ingredients`, `attachments` を操作
- `api/_lib/repositories/masters.ts`
  - `master_data` を操作

## 5. APIとDBの対応表

| API | 主に触るテーブル | 補足 |
|---|---|---|
| `POST /api/auth/login` | `users` | `password_hash` を照合 |
| `GET /api/users` | `users`, `manufacturers` | ロールで参照範囲を制御 |
| `PUT /api/users/:id` | `users`, `manufacturers` | ユーザー更新 |
| `GET /api/sheets` | `entry_sheets` 他3表 | 商品・成分・添付を結合返却 |
| `PUT /api/sheets/:id` | `entry_sheets` 他3表 | トランザクションで一括保存 |
| `PUT /api/master` | `master_data` | 20文字制約あり |
| `POST /api/upload` | DB直接更新なし | Blob保存してURL返却 |

## 6. 代表フロー（保存）

### 6.1 エントリーシート保存

1. `src/components/EntryForm.tsx` が `PUT /api/sheets/:id` を実行
2. `api/sheets/[id].ts` が認証・認可・文字数チェックを実施
3. `api/_lib/media.ts` が画像/添付を検証して Blob URL に正規化
4. `api/_lib/repositories/sheets.ts` がDBへトランザクション保存
5. レスポンス後に不要Blobを非同期クリーンアップ

### 6.2 一覧表示

1. `src/components/EntryList.tsx` が `GET /api/sheets`
2. `api/sheets.ts` が `ADMIN/STAFF` に応じて取得範囲を分岐
3. Repositoryで複数テーブルを組み立て、UI向けJSONで返却

## 7. 移行計画を立てるための観点

### 7.1 AWS移行で分離対象になる箇所

- API実行基盤: `api/`（Vercel Functions -> Lambda/ECS等）
- DB接続層: `api/_lib/db.ts`（Neon接続 -> RDS/Aurora等）
- ファイル保存層: `api/_lib/media.ts`（Vercel Blob -> S3）
- 環境変数運用: `SESSION_SECRET`, `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`

### 7.2 先に確認すべきファイル

1. `api/sheets/[id].ts`（保存の業務ルール）
2. `api/_lib/repositories/sheets.ts`（主要SQL）
3. `api/_lib/media.ts`（画像制約と保存先依存）
4. `api/admin/schema.sql`（DBの真実）
5. `docs/AWS_S3_MIGRATION_PLAN.md`（移行手順）

## 8. 実行モードとデプロイ

- 実装はAPI固定
- ローカル確認: `npm run dev:api`（`vercel dev`）
- 本番: Vercel上で `src/` と `api/` を同一リポジトリからデプロイ

## 9. 関連ドキュメント

- 詳細構成: `docs/PROJECT_STRUCTURE.md`
- DB項目/バリデーション: `docs/DATABASE_SCHEMA.md`
- 権限: `docs/PERMISSIONS.md`
- セキュリティ: `docs/SECURITY.md`
- 将来移行計画: `docs/AWS_S3_MIGRATION_PLAN.md`
