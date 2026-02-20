# PharmaPOP Entry System - システム設計書

## 概要

PharmaPOP Entry Systemは、薬局向けのPOP入力シート管理システムです。従来のExcelベースの管理から脱却し、Webインターフェースで直感的に操作できるアプリケーションです。

## システムアーキテクチャ

### 技術スタック

- **フロントエンド**: React 19.2.4 + TypeScript 5.8.2
- **ビルドツール**: Vite 6.2.0
- **スタイリング**: Tailwind CSS (Utility-first CSS)
- **アイコン**: Lucide React
- **データベース**: Vercel Postgres (Neon) - PostgreSQL互換
- **画像・添付ファイル**: Vercel Blob
- **開発環境**: LocalStorage (ローカル開発時)

### ディレクトリ構成

```
/medicom-entry-sheet/
├── README.md                 # プロジェクト概要
├── docs/                     # ドキュメント
│   ├── DESIGN.md            # システム設計書（本ファイル）
│   ├── PERMISSIONS.md       # 権限設計書
│   ├── SECURITY.md          # セキュリティ設計書
│   └── MIGRATION.md         # DB移行手順書
├── api/                      # APIエンドポイント（Vercel Functions）
│   ├── _lib/                # 共通ライブラリ
│   │   ├── auth.ts          # 認証・認可
│   │   ├── store.ts         # データアクセス層
│   │   ├── password.ts      # パスワードハッシング
│   │   ├── media.ts         # メディア管理
│   │   └── types.ts         # バックエンド型定義
│   ├── auth/                # 認証API
│   │   └── login.ts         # ログインエンドポイント
│   ├── admin/               # 管理者API
│   │   ├── migrate.ts       # データ移行
│   │   └── migrate-to-postgres.ts # PostgreSQL移行
│   ├── sheets.ts            # シート一覧取得
│   ├── sheets/[id].ts       # シート更新・削除
│   ├── users.ts             # ユーザー管理
│   └── master.ts            # マスターデータ管理
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
│   │   ├── dataService.ts   # local/api 切り替え層
│   │   └── apiClient.ts     # HTTP クライアント
│   ├── types.ts             # TypeScript型定義
│   ├── App.tsx              # メインアプリケーション
│   └── index.tsx            # エントリーポイント
```

## データモデル設計

### 1. ユーザー (User)

ユーザーアカウント情報を管理します。

```typescript
interface User {
  id: string;                    // ユーザーID (UUID)
  username: string;              // ログインID（ユニーク）
  password: string;              // パスワード
  displayName: string;           // 表示名
  manufacturerName: string;      // 所属メーカー名 ★権限制御のキー
  email: string;                 // メールアドレス
  phoneNumber: string;           // 電話番号
  role: UserRole;                // 権限ロール (ADMIN | STAFF)
}

enum UserRole {
  ADMIN = 'ADMIN',    // 管理者（弊社メディコム）
  STAFF = 'STAFF'     // 一般ユーザー（他社メーカー）
}
```

**重要フィールド:**
- `manufacturerName`: 権限制御の境界線。同じメーカー名を持つユーザー同士が同じグループ
- `role`: システム全体の権限レベルを決定

### 2. エントリーシート (EntrySheet)

POP情報の申請シート。複数の商品を含むことができます。

```typescript
interface EntrySheet {
  id: string;                    // シートID (UUID)
  creatorId: string;             // 作成者ID
  creatorName: string;           // 作成者名
  manufacturerName: string;      // メーカー名 ★権限フィルタリングに使用
  email: string;                 // 連絡先メール
  phoneNumber: string;           // 連絡先電話番号
  title: string;                 // シートタイトル
  notes?: string;                // エントリシート補足情報
  attachments?: Attachment[];    // シート添付ファイル
  status: 'draft' | 'completed'; // ステータス
  products: ProductEntry[];      // 商品リスト
  createdAt: string;             // 作成日時 (ISO 8601)
  updatedAt: string;             // 更新日時 (ISO 8601)
}
```

**データフロー:**
1. ユーザーがシート作成時、自動的に `creatorId`, `manufacturerName` が設定される
2. `manufacturerName` を元に権限フィルタリングが実行される
3. 他社のシートは一般ユーザーには表示されない

### 3. 商品エントリー (ProductEntry)

各エントリーシート内の個別商品情報。

```typescript
interface ProductEntry {
  id: string;                    // 商品ID (UUID)
  shelfName: string;             // 棚割名（マスターから選択）
  manufacturerName: string;      // メーカー名
  janCode: string;               // JANコード (8/13/16桁)
  productName: string;           // 商品名
  productImage?: string;         // 商品画像 (Base64 or URL)
  riskClassification: string;    // リスク分類（マスターから選択）
  specificIngredients: string[]; // 特定成分（マスターから複数選択）
  catchCopy: string;             // キャッチコピー
  productMessage: string;        // 商品メッセージ
  productNotes?: string;         // 商品補足事項
  productAttachments?: Attachment[]; // 商品添付ファイル

  // サイズ情報
  width: number;                 // 幅 (mm)
  height: number;                // 高さ (mm)
  depth: number;                 // 奥行 (mm)
  facingCount: number;           // フェイシング数

  // 販促物情報
  arrivalDate?: string;          // 店舗着日
  hasPromoMaterial: 'yes' | 'no'; // 販促物有無
  promoSample?: string;          // サンプル情報
  specialFixture?: string;       // 特殊什器
  promoWidth?: number;           // 販促物 幅 (mm)
  promoHeight?: number;          // 販促物 高さ (mm)
  promoDepth?: number;           // 販促物 奥行 (mm)
  promoImage?: string;           // 販促物画像 (Base64 or URL)
}

interface Attachment {
  name: string;                  // ファイル名
  size: number;                  // ファイルサイズ (bytes)
  type: string;                  // MIME Type
  dataUrl: string;               // Base64 Data URL (現状はクライアント保持)
}
```

**バリデーションルール:**
- 必須項目（シート）: `creatorName`, `email`, `phoneNumber`, `title`（下書き保存でも必須）
- 必須項目（商品・完了時）: `productName`, `janCode`, `productImage`
- `janCode` は `8/13/16` 桁のみ許容
- 商品画像サイズは `2MB以上50MB以下`（UIには記載せず、エラー時に表示）
- 添付ファイルは `25MB以下`
- `hasPromoMaterial === 'yes'` の場合、`promoWidth`, `promoImage` が必須
- 棚割り幅合計 `Σ(幅 × フェイシング数)` が `840mm以上` の場合、完了不可（下書き保存は可能）

### 4. マスターデータ (MasterData)

システム全体で共有するマスターデータ。

```typescript
interface MasterData {
  manufacturerNames: string[];     // メーカー名リスト
  shelfNames: string[];           // 棚割名リスト
  riskClassifications: string[];  // リスク分類リスト
  specificIngredients: string[];  // 特定成分リスト
}
```

**初期データ:**
- メーカー名: `['メディコム', '大江戸製薬', '富士ファーマ']`
- 棚割名: `['胃腸薬', '風邪薬', '鎮痛剤', 'ビタミン剤', '目薬', '皮膚用薬']`
- リスク分類: `['第1類医薬品', '指定第2類医薬品', '第2類医薬品', '第3類医薬品', '医薬部外品', '指定医薬部外品']`
- 特定成分: `['イブプロフェン', 'ロキソプロフェン', 'コデイン', 'カフェイン', '抗ヒスタミン成分', '濫用成分']`

## データベース設計（PostgreSQL / Neon）

現在のシステムは **Vercel Postgres (Neon)** を使用しています。詳細なスキーマは `/api/admin/schema.sql` を参照してください。

### ER図

```
┌───────────────┐
│ manufacturers │ メーカーマスター（正規化）
├───────────────┤
│ id (PK)       │ UUID
│ name (UNIQUE) │ メーカー名
│ created_at    │
└───────────────┘
       ↑
       │ FK
┌──────┴────────┐
│   users       │ ユーザーテーブル
├───────────────┤
│ id (PK)       │ UUID
│ username      │ UNIQUE
│ password_hash │ scrypt + salt + pepper
│ display_name  │
│ manufacturer_id (FK) → manufacturers.id
│ email         │
│ phone_number  │
│ role          │ ADMIN | STAFF
│ created_at    │
│ updated_at    │
└───────────────┘
       │
       │ 1:N (creator)
       ↓
┌───────────────┐
│ entry_sheets  │ エントリーシートテーブル
├───────────────┤
│ id (PK)       │ UUID
│ creator_id (FK) → users.id (ON DELETE RESTRICT)
│ manufacturer_id (FK) → manufacturers.id
│ title         │
│ notes         │
│ status        │ draft | completed
│ created_at    │
│ updated_at    │
└───────────────┘
       │
       │ 1:N
       ↓
┌─────────────┐
│ products    │ 商品テーブル
├─────────────┤
│ id (PK)     │
│ sheetId (FK) → entry_sheets.id
│ shelfName   │
│ manufacturerName │
│ janCode     │
│ productName │
│ productImage│
│ ... (その他フィールド)
└─────────────┘

┌─────────────┐
│ master_data │ マスターデータテーブル
├─────────────┤
│ id (PK)     │
│ type        │ (shelf_name / risk_class / ingredient)
│ value       │
│ displayOrder│
└─────────────┘
```

### インデックス設計

```sql
-- 高速検索のためのインデックス
CREATE INDEX idx_users_manufacturer ON users(manufacturerName);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_sheets_manufacturer ON entry_sheets(manufacturerName);
CREATE INDEX idx_sheets_creator ON entry_sheets(creatorId);
CREATE INDEX idx_sheets_status ON entry_sheets(status);
CREATE INDEX idx_products_sheet ON products(sheetId);
```

## 状態管理

### アプリケーション状態

[App.tsx](../App.tsx) で以下の状態を管理:

```typescript
const [currentUser, setCurrentUser] = useState<User | null>(null);
const [currentPage, setCurrentPage] = useState<Page>(Page.LOGIN);
const [sheets, setSheets] = useState<EntrySheet[]>([]);
const [users, setUsers] = useState<User[]>([]);
const [masterData, setMasterData] = useState<MasterData>(...);
```

### データフロー

1. **ログイン**: `storage.login()` → `setCurrentUser()` → LocalStorageに保存
2. **データ読み込み**: `storage.getSheets()` / `storage.getUsers()` → LocalStorageから取得
3. **データ保存**: `storage.saveSheet()` / `storage.saveUsers()` → LocalStorageへ保存
4. **権限フィルタリング**:
   - ADMIN: 全データ表示
   - STAFF: `filter(item => item.manufacturerName === currentUser.manufacturerName)`

## UI/UX設計

### ページ構成

| ページ | 画面ID | 説明 | アクセス権限 |
|--------|--------|------|------------|
| ログイン | `LOGIN` | 認証画面 | 全員 |
| エントリーシート一覧 | `LIST` | シート一覧・検索 | 全員（フィルタ適用） |
| エントリーシート編集 | `EDIT` | シート作成・編集 | 全員（権限チェック） |
| アカウント管理 | `ACCOUNTS` | ユーザー管理 | 全員（フィルタ適用） |
| マスター管理 | `MASTERS` | マスターデータ編集 | **ADMIN のみ** |

### レスポンシブデザイン

- **モバイル**: カード形式で表示（`md:hidden`）
- **デスクトップ**: テーブル形式で表示（`hidden md:block`）
- Tailwind CSS のブレークポイント使用

### 主要機能

#### エントリーシート一覧
- 検索: シート名・メーカー名で絞り込み
- 表示: ステータス（下書き/完了）、更新日、商品数
- 操作: 編集・複製・削除・CSV出力
- 展開: 商品グリッド表示（クリックで展開）

#### エントリーシート編集
- タブ形式で複数商品を管理
- 画像アップロード（Base64変換）
- リアルタイムバリデーション
- 自動保存（更新日時）

#### アカウント管理
- 一覧表示: 表示名、ログインID、メーカー名、権限
- 編集: インラインフォーム
- 権限制御: 他社アカウントは操作不可

## セキュリティ設計

### 認証

- **簡易実装**: username + password でログイン
- **将来**: JWT トークン、セッション管理、OAuth 2.0

### 権限制御

詳細は [PERMISSIONS.md](./PERMISSIONS.md) を参照。

### データ保護

- **現状**: LocalStorage（クライアントサイド）
- **将来**: サーバーサイド DB、暗号化、HTTPS通信

## パフォーマンス最適化

### 実装済み

- React 19 の最適化機能
- Vite の高速ビルド
- 遅延ロード（画像）

### 今後の改善

- コード分割（React.lazy）
- 仮想スクロール（大量データ）
- Service Worker（PWA化）

## テストデータ

### ユーザー

| ユーザー名 | パスワード | メーカー | 権限 |
|----------|----------|---------|------|
| admin | Password1! | メディコム | ADMIN |
| satou | Satou1!! | 大江戸製薬 | STAFF |
| tanaka | Tanaka1! | 富士ファーマ | STAFF |

### エントリーシート

- 大江戸製薬: 2件
- 富士ファーマ: 1件

## 今後の拡張

### フェーズ1（現在）
- LocalStorage ベースのプロトタイプ
- 基本的な CRUD 機能
- 権限制御

### フェーズ2（計画中）
- バックエンド API 実装
- データベース移行（PostgreSQL / MySQL）
- 認証強化（JWT）

### フェーズ3（将来）
- リアルタイム同期
- 通知機能
- モバイルアプリ化（React Native）
- レポート機能（PDF出力）
