# システム構成（概要）

## 1. 全体像

- フロントエンド: React + Vite（`src/`）
- バックエンド: Vercel Functions（`api/`）
- データベース: PostgreSQL（Vercel Postgres / Neon）
- ファイル保存: Vercel Blob（現行）

## 2. 実行モード

- API固定
  - 開発/本番ともに API + DB を使用
  - ローカル確認は `vercel dev` を利用

## 3. リクエストフロー

1. ブラウザ（`src/`）が `api/*` を呼び出す
2. APIで認証・認可チェック（`api/_lib/auth.ts`）
3. Repository層で DB 読み書き（`api/_lib/repositories/*`）
4. 画像・添付は `api/_lib/media.ts` を経由して保存

## 4. 認証と権限

- 認証は API 側で実施（Cookieセッション）
- ロール:
  - `ADMIN`: 全データ操作可能
  - `STAFF`: 自社メーカーのみ操作可能
- マスタデータ API（`/api/master`）は `ADMIN` のみ許可

## 5. デプロイ構成

- Vercel に同一リポジトリをデプロイ
- `src/` はフロント資産として配信
- `api/` はサーバーレス関数として実行

## 6. 関連ドキュメント

- 構成の詳細: `docs/PROJECT_STRUCTURE.md`
- DB項目説明: `docs/DATABASE_SCHEMA.md`
- 権限: `docs/PERMISSIONS.md`
- セキュリティ: `docs/SECURITY.md`
