# PharmaPOP Entry System

薬局向けPOP入力シート管理システム。従来のExcelベースの管理から脱却し、Webインターフェースで直感的に操作できるアプリケーションです。　

## 特徴

- **直感的なUI**: React + Tailwind CSS による使いやすいインターフェース
- **マルチテナント対応**: メーカーごとにデータを分離し、権限管理を実装
- **レスポンシブデザイン**: PC・タブレット・スマートフォンに対応
- **リアルタイムバリデーション**: 入力ミスを即座に検出
- **CSV出力**: エントリーシートをCSV形式でエクスポート可能

## 技術スタック

- **フロントエンド**: React 19.2.4 + TypeScript 5.8.2
- **ビルドツール**: Vite 6.2.0
- **スタイリング**: Tailwind CSS
- **アイコン**: Lucide React
- **データ永続化**: Vercel KV（本番）/ LocalStorage（ローカル）
- **画像・添付ファイル**: Vercel Blob（URL保存）

## セットアップ

### 前提条件

- Node.js 18 以上
- npm または yarn

### インストール

```bash
# 1. 依存関係のインストール
npm install

# 2. 開発サーバーの起動
npm run dev

# 3. UI + 型チェック監視を同時起動
npm run dev:all
```

アプリケーションは http://localhost:3000 で起動します。

### データソース切り替え（Vercel運用）

`.env.local` でデータ取得先を切り替えできます。

```bash
# 既定値: local
VITE_DATA_SOURCE=local

# API接続に切り替える場合（ローカル検証時）
VITE_DATA_SOURCE=api
VITE_API_BASE=http://localhost:3000
```

APIモードでCookieセッションを使う場合は、サーバー側で `SESSION_SECRET` を設定してください。
Vercel本番では `VITE_API_BASE` は未設定（同一オリジン `/api`）を推奨します。
また、APIデータを永続化するために Vercel KV を接続し、`KV_REST_API_URL` と `KV_REST_API_TOKEN` を設定してください。
画像・添付ファイルはVercel Blobへアップロードされるため、`BLOB_READ_WRITE_TOKEN` を設定してください。

`APP_RUNTIME_ENV` によりセキュリティガードを切り替えます。
- `APP_RUNTIME_ENV=test`（既定）: テスト向け挙動
- `APP_RUNTIME_ENV=production`: 本番向け厳格モード
  - `SESSION_SECRET` 必須
  - Vercel KV 必須
  - 空ストア時の初期テストデータ自動投入を禁止

APIモードでローカル確認する場合（`api/` のモックAPI利用）は、Vercel CLIで起動します。

```bash
# APIのみ起動
npm run dev:api

# API + 型チェック監視
npm run dev:api:all
```

### 既存データの移行

Vercelへの移行時は、管理者ログイン後に移行APIでデータを投入できます。

1. 旧環境からデータを取得（管理者）
```bash
curl -b cookie.txt https://<old-domain>/api/admin/migrate > store-backup.json
```
2. 新環境へデータ投入（管理者）
```bash
printf '{"data":' > migrate-payload.json
cat store-backup.json >> migrate-payload.json
printf '}' >> migrate-payload.json

curl -X POST -H "Content-Type: application/json" -b cookie.txt \
  --data-binary @migrate-payload.json \
  https://<new-domain>/api/admin/migrate
```

`/api/admin/migrate` は管理者のみ実行可能です。

既存データに `data:` 形式の画像/添付が含まれる場合、読み込み時に自動でBlobへ移行されます（Blob設定時）。

ローカルStorageデータから移行する場合は、旧アプリ画面でブラウザコンソールを開いて以下を実行し、
出力JSONを `store-backup.json` として保存してください。

```js
const data = {
  users: JSON.parse(localStorage.getItem('pharmapop_users') || '[]'),
  sheets: JSON.parse(localStorage.getItem('pharmapop_sheets') || '[]'),
  master: JSON.parse(localStorage.getItem('pharmapop_master') || '{}'),
};
console.log(JSON.stringify(data));
```

### ビルド

```bash
# プロダクションビルド
npm run build

# ビルドのプレビュー
npm run preview
```

## 使い方

### ログイン

初期ユーザー:

| ユーザー名 | パスワード | メーカー | 権限 |
|----------|----------|---------|------|
| **admin** | password | メディコム | 管理者 |
| **satou** | password | 大江戸製薬 | 一般 |
| **tanaka** | password | 富士ファーマ | 一般 |

### 主要機能

#### 1. エントリーシート管理
- エントリーシートの作成・編集・削除
- 複数商品を1つのシートで管理
- ステータス管理（下書き/完了）
- CSV出力

#### 2. アカウント管理
- ユーザーアカウントの作成・編集・削除
- メーカーごとのアカウント管理
- 権限制御（管理者/一般）

#### 3. マスターデータ管理（管理者のみ）
- メーカー名の管理
- 棚割名の管理
- リスク分類の管理
- 特定成分の管理

## ディレクトリ構成

```
/medicom-entry-sheet/
├── README.md                 # プロジェクト概要（本ファイル）
├── docs/                     # ドキュメント
│   ├── DESIGN.md            # システム設計書
│   └── PERMISSIONS.md       # 権限設計書
├── src/
│   ├── components/          # Reactコンポーネント
│   │   ├── Layout.tsx       # 共通レイアウト
│   │   ├── Login.tsx        # ログイン画面
│   │   ├── EntryList.tsx    # エントリーシート一覧
│   │   ├── EntryForm.tsx    # エントリーシート編集
│   │   ├── AccountManage.tsx # アカウント管理
│   │   └── MasterManage.tsx # マスターデータ管理
│   ├── services/            # ビジネスロジック
│   │   ├── storage.ts       # ローカル永続化層
│   │   └── dataService.ts   # local/api 切り替え層
│   ├── types.ts             # TypeScript型定義
│   ├── App.tsx              # メインアプリケーション
│   └── index.tsx            # エントリーポイント
```

## ドキュメント

詳細な設計情報は以下のドキュメントを参照してください:

- [システム設計書](docs/DESIGN.md) - データモデル、アーキテクチャ、技術仕様
- [権限設計書](docs/PERMISSIONS.md) - ロール定義、アクセス権限、セキュリティ
- [最小API設計（AWS向け）](docs/API_MINIMAL_AWS.md) - 低運用コストでのAPI・認証・運用方針
- [セキュリティ設計書](docs/SECURITY.md) - 脅威モデル、認証/認可、運用チェック

## 権限設計

### 管理者 (ADMIN)
- 全メーカーのエントリーシート・アカウントを管理可能
- マスターデータの編集が可能

### 一般ユーザー (STAFF)
- 自社メーカーのエントリーシート・アカウントのみ管理可能
- 自社アカウントの新規作成が可能
- マスターデータの閲覧・編集は不可

詳細は [docs/PERMISSIONS.md](docs/PERMISSIONS.md) を参照。

## 開発

### コード構成

- **コンポーネント**: `src/components/` - UIコンポーネント
- **ビジネスロジック**: `src/services/` - データ操作ロジック
- **型定義**: `src/types.ts` - TypeScript型定義

### スタイルガイド

- Tailwind CSS のユーティリティクラスを使用
- レスポンシブデザインは `sm:`, `md:`, `lg:` プレフィックスで制御
- カラーパレット: `primary` (sky-500), `danger` (red-500), `warning` (yellow-500)

## ライセンス

Proprietary - メディコム社内用

## サポート

問題が発生した場合は、開発チームまでお問い合わせください。
