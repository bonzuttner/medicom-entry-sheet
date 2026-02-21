# PharmaPOP Entry System

薬局向けPOP入力シート管理システム。従来のExcelベースの管理から脱却し、Webインターフェースで直感的に操作できるアプリケーションです

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
- **データベース**: Vercel Postgres (Neon)
- **画像・添付ファイル**: Vercel Blob
- **データソース**: API（Vercel Functions）

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

### 開発環境設定

現行実装は API 固定です。ローカル確認は `vercel dev`（`npm run dev:api`）を使用してください。

```bash
# Vercel dev の起動URLを使う場合のみ設定（通常は不要）
VITE_API_BASE=<vercel-dev-url>
```

### 本番環境設定

本番環境では以下の環境変数が必要です：

#### 必須

- `POSTGRES_URL`: PostgreSQL接続URL（Vercel Postgres統合で自動設定）
- `SESSION_SECRET`: セッションCookieの署名キー（64文字以上推奨）
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob用トークン

#### オプション

- `PASSWORD_PEPPER`: パスワードハッシュの追加ソルト
- `APP_RUNTIME_ENV`: セキュリティモード（`test` または `production`）
- `MEDIA_ALLOWED_HOSTS`: 外部画像URLのホワイトリスト

APIモードでローカル確認する場合（`api/` のモックAPI利用）は、Vercel CLIで起動します。

```bash
# APIのみ起動
npm run dev:api

# API + 型チェック監視
npm run dev:api:all
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

初期ユーザー（初期データ投入済み環境のみ）:

| ユーザー名 | パスワード | メーカー | 権限 |
|----------|----------|---------|------|
| **admin** | Password1! | メディコム | 管理者 |
| **satou** | Satou1!! | 大江戸製薬 | 一般 |
| **tanaka** | Tanaka1! | 富士ファーマ | 一般 |

### 主要機能

#### 1. エントリーシート管理
- エントリーシートの作成・編集・削除
- 複数商品を1つのシートで管理
- ステータス管理（下書き/完了）
- CSV出力

#### CSV出力仕様（文字化け対策）
- 文字コード: UTF-8（BOM付き）
- 目的: Excelで日本語が文字化けしにくい形式で出力するため
- CSVインジェクション対策: `=`, `+`, `-`, `@` で始まるセルは先頭に `'` を付与

#### 画像一括ダウンロード仕様
- 対象: 一覧画面で選択したエントリーシートに紐づく商品画像
- 出力形式: ZIP（`entry_sheet_images_YYYY-MM-DD.zip`）
- ZIP内ファイル名: `sheetId-productId-商品名.拡張子`
- 画像が1件もない場合: ダウンロードせずメッセージ表示
- 一部取得失敗時: 成功件数/失敗件数を表示（成功分のみZIP化）

#### 2. アカウント管理
- ユーザーアカウントの作成・編集・削除
- メーカーごとのアカウント管理
- 権限制御（管理者/一般）

#### 3. マスターデータ管理（管理者のみ）
- メーカー名の管理
- 棚割名の管理
- リスク分類の管理
- 特定成分の管理

## ディレクトリ構成（概要）

```
/medicom-entry-sheet/
├── README.md                 # プロジェクト概要（本ファイル）
├── docs/                     # ドキュメント
│   ├── DESIGN.md            # システム設計書
│   ├── PERMISSIONS.md       # 権限設計書
│   ├── SECURITY.md          # セキュリティ設計書
│   ├── PROJECT_STRUCTURE.md # 構成の見方
│   ├── DATABASE_SCHEMA.md   # DB項目説明
│   └── SYSTEM_OVERVIEW.md   # システム構成概要
├── api/                      # バックエンド（Vercel Functions）
│   ├── _lib/                # バックエンド共通ロジック
│   │   ├── auth.ts          # 認証・認可
│   │   ├── db.ts            # DB接続
│   │   ├── repositories/    # DBアクセス層（users/sheets/masters）
│   │   └── *.ts             # HTTP・media・password など
│   ├── auth/                # 認証API（login）
│   ├── admin/               # 管理者API・DBスキーマ
│   │   └── schema.sql       # PostgreSQLテーブル定義
│   └── *.ts                 # 業務API（users/sheets/master/upload など）
├── src/
│   ├── components/          # Reactコンポーネント
│   │   ├── Layout.tsx       # 共通レイアウト
│   │   ├── Login.tsx        # ログイン画面
│   │   ├── EntryList.tsx    # エントリーシート一覧
│   │   ├── EntryForm.tsx    # エントリーシート編集
│   │   ├── AccountManage.tsx # アカウント管理
│   │   └── MasterManage.tsx # マスターデータ管理
│   ├── services/            # ビジネスロジック
│   │   ├── dataService.ts   # APIアクセス層
│   │   └── apiClient.ts     # HTTP クライアント
│   ├── types.ts             # TypeScript型定義
│   ├── App.tsx              # メインアプリケーション
│   └── index.tsx            # エントリーポイント
```

## ドキュメント

詳細な設計情報は以下のドキュメントを参照してください:

- [システム設計書](docs/DESIGN.md) - データモデル、アーキテクチャ、技術仕様
- [権限設計書](docs/PERMISSIONS.md) - ロール定義、アクセス権限、セキュリティ
- [セキュリティ設計書](docs/SECURITY.md) - 脅威モデル、認証/認可、運用チェック
- [開発セットアップ最短手順](docs/SETUP_QUICKSTART.md) - 起動方法、環境変数サンプル、DB初期化
- [プロジェクト構成の見方](docs/PROJECT_STRUCTURE.md) - バックエンド/DB設計ファイルの場所
- [DB項目説明](docs/DATABASE_SCHEMA.md) - 主要テーブルとカラムの意味
- [システム構成概要](docs/SYSTEM_OVERVIEW.md) - フロント/バック/API/DBの関係
- [S3移行計画](docs/AWS_S3_MIGRATION_PLAN.md) - 将来AWSへ分離する場合の手順

## 権限設計

### 管理者 (ADMIN)
- 全メーカーのエントリーシート・アカウントを管理可能
- マスターデータの編集が可能

### 一般ユーザー (STAFF)
- 自社メーカーのエントリーシート・アカウントのみ管理可能
- 自社アカウントの新規作成が可能
- マスタ管理画面へのアクセスは不可
- エントリー入力に必要なマスタ値（棚割名・リスク分類・特定成分）は参照可能

詳細は [docs/PERMISSIONS.md](docs/PERMISSIONS.md) を参照。

## 開発

### コード構成

- **コンポーネント**: `src/components/` - UIコンポーネント
- **ビジネスロジック**: `src/services/` - データ操作ロジック
- **型定義**: `src/types.ts` - TypeScript型定義
- **API**: `api/` - Vercel Functions（Node.js + TypeScript）

### スタイルガイド

- Tailwind CSS のユーティリティクラスを使用
- レスポンシブデザインは `sm:`, `md:`, `lg:` プレフィックスで制御
- カラーパレット: `primary` (sky-500), `danger` (red-500), `warning` (yellow-500)

## デプロイ

### Vercelへのデプロイ

1. Vercel CLIをインストール: `npm install -g vercel`
2. プロジェクトをリンク: `vercel link`
3. Vercel Postgres統合を追加: `vercel integration add neon`
4. DBスキーマを適用（`api/admin/schema.sql`）
5. 本番デプロイ: `vercel --prod`

## ライセンス

Proprietary - メディコム社内用

## サポート

問題が発生した場合は、開発チームまでお問い合わせください。
