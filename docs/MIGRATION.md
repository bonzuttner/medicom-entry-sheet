# PharmaPOP Entry System - データベース移行手順書

## 概要

このドキュメントは、PharmaPOP Entry Systemを**Vercel KV（廃止済み）から Vercel Postgres (Neon)** に移行する手順を説明します。

---

## 背景

### 問題

1. **Vercel KVは2024年末に廃止されました**
   - 現在のコード（`api/_lib/kv.ts`）はVercel KV REST APIを使用していますが、このサービスはサンセット済みです
   - 本番環境は既に動作していない可能性が高いです

2. **現在のDB設計の技術的問題**
   - 全データを一度にメモリロード（スケーラビリティ問題）
   - O(n)線形検索（パフォーマンス問題）
   - 参照整合性の欠如（データ整合性問題）

### 解決策

**Vercel Postgres (Neon統合)** に移行します。

- Vercel Marketplaceから提供される公式Neon統合を使用
- Hobby tier（無料枠）: 512MB容量、60時間/月計算時間
- 100-500件のデータなら無料枠で十分

---

## 重要な注意事項

### @vercel/postgres の廃止警告

`@vercel/postgres` パッケージは廃止予定（deprecated）です。

```
@vercel/postgres is deprecated. If you are setting up a new database,
you can choose an alternate storage solution from the Vercel Marketplace.
```

**ガイド**: https://neon.com/docs/guides/vercel-postgres-transition-guide

**推奨される移行パス**:
1. **短期（フェーズ1）**: `@vercel/postgres` を使用してデータ移行を完了
2. **中期（フェーズ2）**: Neon公式SDK `@neondatabase/serverless` に移行

この手順書では、まずフェーズ1（緊急対応）を説明します。

---

## 前提条件

- Node.js 18以上
- npm 8以上
- Vercel CLI（インストール: `npm install -g vercel`）
- Vercelプロジェクトへのアクセス権限（Owner または Admin）

---

## フェーズ1: 緊急対応（1週間）

### ステップ1: 既存データのバックアップ

**重要**: 移行前に必ず全データをバックアップしてください。

#### 1.1 ローカル環境の起動

```bash
cd /path/to/medicom-entry-sheet
npm install
npm run dev:api
```

#### 1.2 管理者でログイン

ブラウザで `http://localhost:3000` を開き、管理者でログインします。

```
ユーザー名: admin
パスワード: （本番環境のパスワード）
```

#### 1.3 データをエクスポート

開発者ツールのコンソールで以下を実行：

```javascript
// Cookieを含めてGETリクエスト
fetch('/api/admin/migrate', {
  method: 'GET',
  credentials: 'include'
})
  .then(res => res.json())
  .then(data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmapop-backup-${new Date().toISOString()}.json`;
    a.click();
  });
```

または、curlコマンド（Cookieを手動で取得する必要があります）：

```bash
# セッションCookieを含めてリクエスト
curl -b "pharmapop_session_user=YOUR_SESSION_COOKIE" \
  https://your-app.vercel.app/api/admin/migrate \
  > backup-$(date +%Y%m%d).json
```

---

### ステップ2: Vercel Postgres (Neon) の有効化

#### 2.1 Vercel Marketplaceから統合を追加

**方法A: Vercel Dashboard（推奨）**

1. https://vercel.com/dashboard にアクセス
2. プロジェクトを選択
3. "Storage" タブ → "Create Database"
4. "Postgres" を選択 → "Neon" を選択
5. データベース名を入力（例: `pharmapop-db`）
6. リージョンを選択（日本の場合: `ap-southeast-1`）
7. "Create & Continue" をクリック

**方法B: Vercel CLI**

```bash
# プロジェクトルートで実行
vercel link  # プロジェクトをリンク（初回のみ）
vercel integration add neon

# ブラウザが開くので、指示に従って統合を完了
```

#### 2.2 環境変数の確認

統合が完了すると、以下の環境変数が自動的に設定されます：

- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NO_SSL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

ローカル環境に取得：

```bash
vercel env pull .env.local
```

`.env.local` ファイルが作成され、環境変数が記録されます。

---

### ステップ3: PostgreSQLスキーマの作成

#### 3.1 psqlで接続

```bash
# .env.local から環境変数を読み込み
source .env.local

# PostgreSQLに接続
psql $POSTGRES_URL
```

または、Neon CLIを使用：

```bash
# Neon CLIのインストール
npm install -g neonctl

# Neonにログイン
neonctl auth

# データベースに接続
neonctl connection-string YOUR_PROJECT_ID
```

#### 3.2 スキーマを実行

```bash
# スキーマファイルを実行
psql $POSTGRES_URL -f api/admin/schema.sql
```

#### 3.3 テーブルが作成されたことを確認

```sql
-- psql内で実行
\dt

-- 期待される出力:
-- manufacturers
-- users
-- entry_sheets
-- product_entries
-- product_ingredients
-- attachments
-- master_data
```

---

### ステップ4: データ移行の実行

#### 4.1 ローカル環境でAPIサーバーを起動

```bash
npm run dev:api
```

#### 4.2 管理者でログイン

ブラウザで `http://localhost:3000` を開き、管理者でログインします。

#### 4.3 データをインポート

開発者ツールのコンソールで以下を実行：

```javascript
// バックアップファイルを選択
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json';
fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  const text = await file.text();
  const data = JSON.parse(text);

  // PostgreSQLにインポート
  const response = await fetch('/api/admin/migrate-to-postgres', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'include',
    body: JSON.stringify({ data })
  });

  const result = await response.json();
  console.log('Migration result:', result);
};
fileInput.click();
```

または、curlコマンド：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -b "pharmapop_session_user=YOUR_SESSION_COOKIE" \
  -d @backup-20260220.json \
  http://localhost:3000/api/admin/migrate-to-postgres
```

#### 4.4 移行結果の確認

成功すると、以下のようなレスポンスが返ります：

```json
{
  "ok": true,
  "migrated": {
    "manufacturers": 3,
    "users": 5,
    "sheets": 123,
    "products": 1234
  }
}
```

---

### ステップ5: データ整合性の検証

#### 5.1 データ件数の確認

```sql
-- psqlで実行
SELECT COUNT(*) FROM manufacturers;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM entry_sheets;
SELECT COUNT(*) FROM product_entries;
```

#### 5.2 外部キー制約のテスト

```sql
-- シートとユーザーのJOIN
SELECT
  s.id,
  s.title,
  u.display_name AS creator_name,
  m.name AS manufacturer_name
FROM entry_sheets s
JOIN users u ON s.creator_id = u.id
JOIN manufacturers m ON s.manufacturer_id = m.id
LIMIT 10;

-- 商品とシートのJOIN
SELECT
  p.id,
  p.product_name,
  s.title AS sheet_title
FROM product_entries p
JOIN entry_sheets s ON p.sheet_id = s.id
LIMIT 10;
```

#### 5.3 データの比較

バックアップJSONファイルと、PostgreSQLのデータを比較します：

```javascript
// ブラウザのコンソールで実行（バックアップJSONを読み込み済みと仮定）
console.log('Expected users:', backupData.users.length);
console.log('Expected sheets:', backupData.sheets.length);
console.log('Expected products:', backupData.sheets.reduce((sum, s) => sum + s.products.length, 0));
```

---

### ステップ6: 本番環境へのデプロイ

#### 6.1 環境変数の確認

Vercel Dashboardで、本番環境の環境変数が設定されていることを確認：

- `POSTGRES_URL` などのNeon関連変数
- 既存の変数（`SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`など）

#### 6.2 デプロイ

```bash
# mainブランチにコミット＆プッシュ
git add .
git commit -m "feat: migrate to PostgreSQL (Neon) from Vercel KV"
git push origin main

# または、Vercel CLIで直接デプロイ
vercel --prod
```

#### 6.3 本番環境でのデータ移行

**重要**: 本番環境でも同じ手順でデータ移行を実行します。

1. 本番環境のURLを開く（例: `https://your-app.vercel.app`）
2. 管理者でログイン
3. ステップ4.3と同じ方法でデータをインポート

---

## トラブルシューティング

### Q1: "KV request failed" エラーが出る

**原因**: Vercel KVが既に廃止されているため、APIが動作しません。

**解決策**:
- `/tmp` ファイルベースでローカル環境を起動
- 環境変数 `KV_REST_API_URL`, `KV_REST_API_TOKEN` を削除または無効化

```bash
# .env.local から以下を削除
# KV_REST_API_URL=...
# KV_REST_API_TOKEN=...
```

### Q2: "Manufacturer not found" エラー

**原因**: データ移行の順序が間違っています（manufacturersより先にusersを投入しようとした）。

**解決策**: スクリプトは自動的に正しい順序で実行します。エラーが出る場合は、トランザクションが正しくロールバックされているか確認してください。

### Q3: "ROLLBACK" エラー

**原因**: データ移行中にエラーが発生し、トランザクションがロールバックされました。

**解決策**:
1. エラーメッセージを確認
2. データの形式を確認（UUIDが正しいか、必須フィールドが存在するかなど）
3. 再度移行を実行

### Q4: 無料枠の計算時間を超過した

**症状**: Neonから "Compute time quota exceeded" エラー

**解決策**:
- Neon DashboardでPro tierにアップグレード（$20/月）
- または、不要なクエリを減らす

---

## 実施済み改善（2026年2月）

### 即時対応完了

レビュー指摘事項のうち、即座に対応可能な問題を修正しました。

#### 1. pruneSheetsByRetention の二重実行削除

**問題**: [api/sheets/[id].ts](../api/sheets/[id].ts) で同一リクエスト内に `pruneSheetsByRetention` が3回実行されていた

**修正内容**:
- ハンドラー冒頭の不要なprune処理を削除
- PUT/DELETE処理内の1回のみに削減
- パフォーマンス改善とコードの簡素化

**変更ファイル**: `api/sheets/[id].ts`

#### 2. readStore() マイグレーション処理の最適化

**問題**: 毎回のAPIリクエストでパスワードハッシュ化・メディア移行などのマイグレーション処理が実行されていた

**修正内容**:
- マイグレーション処理を本番環境では実行しないように変更
- 開発環境でのみ実行（警告ログ付き）
- 本番環境では `/api/admin/migrate-to-postgres` を使用することを推奨

**変更ファイル**: `api/_lib/store.ts`

```typescript
// Before: 毎回実行
const migratedUsers = parsed.users.map((user) => {
  if (!user.password || isHashedPassword(user.password)) {
    return user;
  }
  changed = true;
  return { ...user, password: hashPassword(user.password) };
});

// After: 本番環境では実行しない
if (!isProductionRuntime()) {
  const migratedUsers = parsed.users.map((user) => {
    if (!user.password || isHashedPassword(user.password)) {
      return user;
    }
    changed = true;
    console.warn(`[Migration] Hashing password for user: ${user.username}`);
    return { ...user, password: hashPassword(user.password) };
  });
  if (changed) {
    parsed.users = migratedUsers;
  }
}
```

### Phase 2 準備完了

PostgreSQL移行のための基盤コードを作成しました。

#### 3. PostgreSQL接続プールの作成

**作成ファイル**: `api/_lib/db.ts`

**機能**:
- `@vercel/postgres` を使用したデータベース接続プール
- トランザクション処理のサポート
- エラーハンドリングとログ出力
- 接続状態確認機能

**主要関数**:
```typescript
// クエリ実行
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// 単一行取得
const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [userId]);

// トランザクション
await db.transaction(async (client) => {
  await client.query('INSERT INTO users ...');
  await client.query('INSERT INTO entry_sheets ...');
});
```

#### 4. データベースヘルパー関数の作成

**作成ファイル**: `api/_lib/dbHelpers.ts`

**機能**:
- よく使うCRUD操作をシンプルなAPIで提供
- WHERE条件の自動構築
- パラメータバインディングの自動化

**主要関数**:
```typescript
// ID検索
const sheet = await findById('entry_sheets', sheetId);

// 条件検索
const sheets = await findMany('entry_sheets',
  { manufacturer_id: manufacturerId },
  'created_at DESC'
);

// 挿入
const newSheet = await insert('entry_sheets', { id: uuid(), title: '...' });

// 更新
const updated = await updateById('entry_sheets', sheetId, { status: 'completed' });

// 削除
const deleted = await deleteById('entry_sheets', sheetId);
```

### 残存する問題

以下の問題は、Phase 2（APIレイヤー書き換え）の完了により解決されます：

| 問題 | 深刻度 | 解決方法 |
|------|--------|----------|
| 競合によるデータ消失 | 🔴 致命的 | PostgreSQLトランザクション処理 |
| 全データ一括読み書き | 🔴 致命的 | エンティティごとのクエリ |
| `/tmp` の非共有問題 | 🔴 致命的 | PostgreSQLに移行 |
| 設計書と実装の乖離 | 🟠 高 | schema.sql に従った実装 |

---

## 次のステップ（フェーズ2）

フェーズ1が完了したら、次は**APIレイヤーの最適化**（フェーズ2）を実施します。

### フェーズ2の概要

1. **データベース接続プールの実装** (`api/_lib/db.ts`)
2. **APIエンドポイントの書き換え**:
   - `api/sheets.ts` - JOIN + WHEREクエリに変換
   - `api/sheets/[id].ts` - トランザクション処理
   - `api/users.ts` - SELECT/INSERT/UPDATE文
   - `api/_lib/auth.ts` - JOINクエリ

3. **Neon公式SDKへの移行** (`@neondatabase/serverless`)

詳細は別途ドキュメントを作成します。

---

## 参考資料

- [Neon Documentation](https://neon.com/docs)
- [Vercel Postgres Transition Guide](https://neon.com/docs/guides/vercel-postgres-transition-guide)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## サポート

問題が発生した場合は、以下を確認してください：

1. Vercel Dashboard → Storage → Neon データベースのステータス
2. Vercel Function Logs（`vercel logs`コマンド）
3. Neon Dashboard → Monitoring

緊急の場合は、バックアップJSONから元の環境（`/tmp` ファイルベース）に戻すことができます。
