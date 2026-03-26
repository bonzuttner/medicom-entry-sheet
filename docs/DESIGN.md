# PharmaPOP Entry System - システム設計書

## 1. 目的

本書は、現在の実装に基づいてシステム全体の設計を説明する。
「フロントエンド / API / DB」の責務境界と主要データフローを、初見のエンジニアが把握できることを目的とする。

## 2. システム構成

### 2.1 構成概要

- フロントエンド: React + TypeScript + Vite（`src/`）
- バックエンド: Vercel Functions（`api/`）
- DB: PostgreSQL（Vercel Postgres / Neon）
- 画像/添付: Vercel Blob

### 2.2 実行モード

- 開発/本番ともに API を利用
- ローカル確認は `vercel dev` で `api/` を起動

## 3. ディレクトリ責務

### 3.1 フロントエンド

- `src/App.tsx`: 画面遷移・状態管理の中心
- `src/components/`
  - `EntryList.tsx`: エントリー履歴一覧
  - `AdminEntryList.tsx`: Admin向け一覧（Adminメモの行内編集）
  - `EntryForm.tsx`: 登録・編集フォーム
  - `AccountManage.tsx`: アカウント管理
  - `MasterManage.tsx`: マスタ管理
  - `Layout.tsx`: ナビゲーション
- `src/services/`
  - `dataService.ts`: APIアクセス
  - `apiClient.ts`: API呼び出し

### 3.2 バックエンド

- `api/_lib/`
  - `auth.ts`: 認証・認可ヘルパー
  - `http.ts`: HTTP共通処理（JSON/セッションCookie等）
  - `db.ts`: DB接続・トランザクション
  - `password.ts`: パスワードハッシュ/照合
  - `media.ts`: 画像・添付の検証/Blob保存
  - `repositories/`: 各テーブルのデータアクセス
- `api/*.ts`: APIエンドポイント
  - `api/auth/login.ts`
  - `api/current-user.ts`
  - `api/sheets.ts`, `api/sheets/[id].ts`
  - `api/sheets/[id]/revisions.ts`
  - `api/users.ts`, `api/users/[id].ts`
  - `api/master.ts`
  - `api/products/search.ts`
  - `api/upload.ts`
  - `api/admin/*`（移行系）

### 3.4 バックエンド内部の責務分離

- API層（`api/*.ts`）:
  - 認証・認可、リクエストバリデーション、レスポンス制御
- ドメイン共通層（`api/_lib/*.ts`）:
  - 認証、セッション、メディア処理、DB接続、パスワード処理
- 永続化層（`api/_lib/repositories/*.ts`）:
  - SQL定義とテーブル更新整合を担当

移行時の原則:
- 実行基盤移行（Vercel -> AWS）は API層+共通層が主対象
- DB移行（Neon -> RDS/Aurora）は `db.ts` とSQL互換確認が主対象
- ストレージ移行（Blob -> S3）は `media.ts` が主対象

### 3.3 DB設計

- スキーマ定義: `api/admin/schema.sql`
- 主要テーブル:
  - `manufacturers`
  - `users`
  - `entry_sheets`
  - `entry_sheet_admin_memos`
  - `manufacturer_products`
  - `manufacturer_product_ingredients`
  - `product_entries`
  - `product_ingredients`
  - `attachments`
  - `master_data`
  - `manufacturer_shelf_names`
  - `manufacturer_default_start_months`
  - `entry_sheet_revisions`

## 4. データモデル（アプリ）

型定義は `src/types.ts` と `api/_lib/types.ts` にある。

- `User`: `ADMIN` / `STAFF` を持つ
- `EntrySheet`: シートヘッダ情報 + `products`
  - `deploymentStartMonth` を保持
  - `version` を保持（競合制御）
  - `status`: `draft` / `completed` / `completed_no_image`
  - `adminMemo` を保持（編集は ADMIN のみ、`entry_sheet_admin_memos` に分離保存）
- `ProductEntry`: シート保存時点の商品スナップショット（JAN、画像、販促物情報など）
- `manufacturer_products`: メーカー内で JAN 一意の検索用商品マスタ
- `MasterData`: メーカー名・リスク分類・特定成分・メーカー別棚割名・メーカー別デフォルト展開スタート月

補足:
- APIでは `manufacturer_id`（UUID FK）で正規化しつつ、UIには `manufacturerName` を返す

## 5. API設計（要点）

### 5.1 認証・セッション

- ログイン: `POST /api/auth/login`
- 現在ユーザー: `GET /api/current-user`
- ログアウト: `DELETE /api/current-user`
- セッションCookieは `HttpOnly`、署名付き

### 5.2 権限

- `ADMIN`: 全メーカーアクセス可
- `STAFF`: 自社メーカーのみアクセス可
- マスタAPI（`/api/master`）:
  - `GET`: 認証済みユーザー全員可（入力用マスタ参照）
    - STAFF には `manufacturerNames: []` を返却（他社メタ情報の露出防止）
  - `PUT`: `ADMIN` のみ可（マスタ更新）
- 権限制御は API 側で実施（UIは補助）

### 5.3 主要API

- シート一覧: `GET /api/sheets`
  - `offset/limit` 指定時は `{ items, hasMore, totalCount }` を返却
- シート保存: `PUT /api/sheets/:id`
  - 通常保存（シート全体）と `mode=admin_memo`（Adminメモのみ）に対応
  - `version` 不一致時は `409 VERSION_CONFLICT`
  - JAN重複時は `409 JAN_CONFLICT`
- シート削除: `DELETE /api/sheets/:id`
- シート変更履歴: `GET /api/sheets/:id/revisions`
  - 通常シート項目の変更のみ記録
  - Adminメモ更新は履歴対象外
- 過去商品検索: `GET /api/products/search`
- ユーザー一覧: `GET /api/users`
- ユーザー保存: `PUT /api/users/:id`
- ユーザー削除: `DELETE /api/users/:id`
- マスタ取得/更新: `GET/PUT /api/master`

補足:
- 一覧表示およびCSV出力の `状態` 文言は統一し、UI表示ラベル（`下書き` / `完了` / `完了 -商品画像なし`）を使用する

## 6. 保存フロー

### 6.1 エントリーシート保存

1. UIで入力
2. `dataService.saveSheet` 実行
3. API側で認証・認可・入力検証
4. DBへ `entry_sheets` / `manufacturer_products` / `manufacturer_product_ingredients` / `product_entries` / `product_ingredients` / `attachments` を保存
5. 一覧を再取得し画面反映

補足:
- 過去商品検索は `manufacturer_products` を検索元とする
- `product_entries` はシート保存時点のスナップショットとして維持する
- 保存は 1 トランザクションで実施し、途中失敗時は全ロールバックする
- 本対応では、本番後に不要になる一時DB項目・移行専用テーブルは追加しない

### 6.2 Adminメモ保存

1. Admin一覧または編集画面で Adminメモを更新
2. Admin一覧では `dataService.saveSheetAdminMemo` を実行（`PUT /api/sheets/:id` + `mode=admin_memo`）
3. 編集画面では、Adminメモのみ変更時は `dataService.saveSheetAdminMemo`、通常項目も同時に変更した場合は `dataService.saveSheet` を実行
4. API側で ADMIN権限・入力検証・`adminMemo.version` 競合検知を実施
5. `entry_sheet_admin_memos` を更新し、通常項目も同時保存された場合のみ `entry_sheets` 側も更新
6. 成功時に更新済みシートを再取得し画面へ反映

補足:
- Adminメモのみ更新では `entry_sheets.updated_at` は更新しない
- 一覧の並び替え（`updated_at`）は通常シート更新のみ反映
- Adminメモ更新では `entry_sheet_revisions` を追加しない
- 変更履歴画面には Adminメモ差分を表示しない

### 6.3 画像/添付

- クライアントでもサイズ・解像度を先に検証
- APIでも同条件を再検証
- 画像/添付の実体は Blob に保存し、DBには URL を保存

## 7. バリデーション（主要要件）

- 商品画像
  - 25MB以下
  - 短辺1000px未満はエラー
  - 2500px × 3508px程度を推奨表示
- 添付ファイル
  - 25MB以下
- JANコード
  - 全角数字入力を半角数字へ正規化して扱う

## 8. 非機能上の注意

- `@vercel/postgres` は将来的なSDK移行候補（Neon SDK）
- ログイン試行制限のカウンタは現状 `/tmp` ファイル利用
  - 無料サーバーレス環境では永続性が弱いため、将来 Redis 等への移行が望ましい
- 一覧ページングは初期30件 + 追加読み込み方式
  - 一般一覧/Admin一覧ともに、表示件数・全件数・残件数/残ページ（概算）を表示

## 9. 移行影響の早見表

| 移行対象 | 主な修正ファイル | 影響範囲 |
|---|---|---|
| Blob -> S3 | `api/_lib/media.ts`, `api/upload.ts` | 画像/添付アップロード・参照 |
| Neon -> AWS DB | `api/_lib/db.ts`, `api/_lib/repositories/*.ts` | 全APIの永続化 |
| Vercel Functions -> AWS実行基盤 | `api/*`, デプロイ設定 | API全体 |
| CDN/配信変更 | フロント配信設定、`VITE_API_BASE` | UIの接続先 |

## 10. 参照ドキュメント

- 権限設計: `docs/PERMISSIONS.md`
- セキュリティ設計: `docs/SECURITY.md`
- DB項目定義: `docs/DATABASE_SCHEMA.md`
- 構成全体: `docs/SYSTEM_OVERVIEW.md`
- 移行計画: `docs/AWS_S3_MIGRATION_PLAN.md`
