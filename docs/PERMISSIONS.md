# PharmaPOP Entry System - 権限設計書

## 概要

本システムでは、ユーザーの所属メーカーと権限ロールに基づいて、アクセス可能なデータと操作を制限します。

## ロール定義

### 管理者 (ADMIN)

- **対象**: メディコム社員
- **権限範囲**: 全メーカーのデータ
- **特権**: マスターデータ管理

### 一般ユーザー (STAFF)

- **対象**: 各メーカー社員
- **権限範囲**: 自社メーカーのデータのみ
- **制限**: マスターデータ閲覧・編集不可

## データアクセス権限

### 1. エントリーシート・商品データ

#### 閲覧権限

| ロール | 閲覧可能なシート |
|-------|----------------|
| **ADMIN** | 全メーカーのエントリーシート |
| **STAFF** | 自社メーカーのエントリーシートのみ |

**実装箇所**: [App.tsx:136-138](../App.tsx#L136-L138)

```typescript
const visibleSheets = currentUser.role === UserRole.ADMIN
  ? sheets
  : sheets.filter(sheet => sheet.manufacturerName === currentUser.manufacturerName);
```

#### 編集・削除権限

| ロール | 編集・削除可能なシート |
|-------|-------------------|
| **ADMIN** | 全メーカーのエントリーシート |
| **STAFF** | 自社メーカーのエントリーシートのみ |

**実装箇所**: [EntryList.tsx:18-21](../components/EntryList.tsx#L18-L21)

```typescript
const canModifySheet = (sheet: EntrySheet): boolean => {
  if (currentUser.role === UserRole.ADMIN) return true;
  return sheet.manufacturerName === currentUser.manufacturerName;
};
```

**UI制御**:
- 他社のシートの編集・複製・削除ボタンは無効化（グレーアウト）
- ホバー時に「編集権限がありません」と表示

### 2. アカウント管理

#### 閲覧権限

| ロール | 閲覧可能なアカウント |
|-------|-------------------|
| **ADMIN** | 全メーカーのアカウント |
| **STAFF** | 自社メーカーのアカウントのみ |

**実装箇所**: [App.tsx:141-143](../App.tsx#L141-L143)

```typescript
const visibleUsers = currentUser.role === UserRole.ADMIN
  ? users
  : users.filter(user => user.manufacturerName === currentUser.manufacturerName);
```

#### 編集・削除権限

| ロール | 編集・削除可能なアカウント |
|-------|----------------------|
| **ADMIN** | 全メーカーのアカウント |
| **STAFF** | 自社メーカーのアカウントのみ |

**実装箇所**: [AccountManage.tsx:17-20](../components/AccountManage.tsx#L17-L20)

```typescript
const canModifyUser = (targetUser: User): boolean => {
  if (currentUser.role === UserRole.ADMIN) return true;
  return targetUser.manufacturerName === currentUser.manufacturerName;
};
```

#### アカウント作成権限

| ロール | 作成可能なアカウント |
|-------|------------------|
| **ADMIN** | 全メーカーのアカウントを作成可能 |
| **STAFF** | **自社メーカーのアカウントのみ作成可能** ✅ |

**重要**: STAFF も自社のアカウントを発行できます。

**実装箇所**: [AccountManage.tsx:22-32](../components/AccountManage.tsx#L22-L32)

```typescript
const handleSave = () => {
  // バリデーション: STAFF は自社以外のメーカー名を設定できない
  if (currentUser.role === UserRole.STAFF &&
      editingUser.manufacturerName !== currentUser.manufacturerName) {
    setValidationError(`他社（${editingUser.manufacturerName}）のアカウントは作成・編集できません`);
    return;
  }
  // ... 保存処理
};
```

**UI制御**:
- STAFF がアカウント作成時、メーカー名フィールドは自動入力され、編集不可
- 他社アカウントの編集・削除ボタンは無効化

### 3. マスターデータ管理

#### 閲覧権限

| ロール | 閲覧 |
|-------|-----|
| **ADMIN** | ✅ 可能 |
| **STAFF** | ❌ **不可** |

**実装箇所**: [Layout.tsx:63-68](../components/Layout.tsx#L63-L68)

```typescript
{/* Master Management - Explicitly Admin Only */}
{currentUser.role === UserRole.ADMIN && (
  <NavButton
     active={currentPage === Page.MASTERS}
     onClick={() => onNavigate(Page.MASTERS)}
     icon={<Settings size={18} />}
     label="マスタ管理"
  />
)}
```

**UI制御**:
- STAFF には「マスタ管理」メニューが表示されない
- URL直接アクセスでも、レンダリング時に権限チェック
- APIでも `GET /api/master` はADMINのみ許可（STAFF/未認証は 403/401）

#### 編集権限

| ロール | 編集 |
|-------|-----|
| **ADMIN** | ✅ 可能 |
| **STAFF** | ❌ 不可 |

### 4. ナビゲーションメニュー表示制御

| メニュー項目 | ADMIN | STAFF |
|------------|-------|-------|
| エントリーシート一覧 | ✅ | ✅ |
| アカウント管理 | ✅ | ✅ |
| マスタ管理 | ✅ | ❌ |

**実装箇所**: [Layout.tsx:46-74](../components/Layout.tsx#L46-L74)

## 権限チェックのフロー

### 1. ログイン時

```
ユーザー入力
  ↓
storage.login(username, password)
  ↓
認証成功 → User オブジェクト取得
  ↓
setCurrentUser(user)
  ↓
LocalStorage に保存
  ↓
ページ遷移 (Page.LIST)
```

### 2. データ読み込み時

```
App.tsx でデータ取得
  ↓
storage.getSheets() / storage.getUsers()
  ↓
権限フィルタリング実行
  ↓
visibleSheets / visibleUsers 生成
  ↓
コンポーネントに渡す
```

### 3. 操作実行時

```
ユーザーがボタンクリック（例: 編集）
  ↓
canModifySheet(sheet) / canModifyUser(user) 実行
  ↓
権限チェック
  ↓
  ├─ 権限あり → 操作実行
  └─ 権限なし → ボタン無効化（UI制御で防止）
```

## セキュリティ対策

### フロントエンド（現在）

1. **UI制御**:
   - ボタンの無効化（`disabled` 属性）
   - メニューの非表示（条件付きレンダリング）
   - データのフィルタリング

2. **権限チェック関数**:
   - `canModifySheet()`: エントリーシート操作前にチェック
   - `canModifyUser()`: アカウント操作前にチェック

### バックエンド（将来の実装）

1. **API レベルの権限チェック**:
   ```typescript
   // 例: Express.js ミドルウェア
   const checkPermission = (req, res, next) => {
     const { user } = req.session;
     const { sheetId } = req.params;
     const sheet = await getSheet(sheetId);

     if (user.role !== 'ADMIN' &&
         sheet.manufacturerName !== user.manufacturerName) {
       return res.status(403).json({ error: 'Forbidden' });
     }
     next();
   };
   ```

2. **データベースクエリでのフィルタリング**:
   ```sql
   -- STAFF ユーザーの場合
   SELECT * FROM entry_sheets
   WHERE manufacturerName = :currentUserManufacturer;

   -- ADMIN ユーザーの場合
   SELECT * FROM entry_sheets;
   ```

## テストシナリオ

### 1. ADMIN ユーザー（admin）

| 操作 | 期待結果 |
|-----|---------|
| ログイン | 成功 |
| エントリーシート一覧 | 全メーカーのシート表示（大江戸製薬2件 + 富士ファーマ1件） |
| 他社シート編集 | 可能 |
| 他社シート削除 | 可能 |
| アカウント一覧 | 全アカウント表示（3名） |
| 他社アカウント編集 | 可能 |
| 他社アカウント作成 | 可能 |
| マスタ管理メニュー | 表示される |
| マスタ管理画面 | アクセス可能・編集可能 |

### 2. STAFF ユーザー（satou - 大江戸製薬）

| 操作 | 期待結果 |
|-----|---------|
| ログイン | 成功 |
| エントリーシート一覧 | 大江戸製薬のシートのみ表示（2件） |
| 自社シート編集 | 可能 |
| 自社シート削除 | 可能 |
| 他社シート表示 | 表示されない（富士ファーマのシートは非表示） |
| アカウント一覧 | 大江戸製薬のアカウントのみ表示（satou のみ） |
| 自社アカウント編集 | 可能 |
| 自社アカウント作成 | 可能（メーカー名は「大江戸製薬」固定） |
| 他社アカウント表示 | 表示されない |
| マスタ管理メニュー | 表示されない |
| マスタ管理画面（URL直接） | レンダリングされない |

### 3. STAFF ユーザー（tanaka - 富士ファーマ）

| 操作 | 期待結果 |
|-----|---------|
| ログイン | 成功 |
| エントリーシート一覧 | 富士ファーマのシートのみ表示（1件） |
| 自社シート編集 | 可能 |
| 他社シート表示 | 表示されない（大江戸製薬のシートは非表示） |
| アカウント一覧 | 富士ファーマのアカウントのみ表示（tanaka のみ） |
| 自社アカウント作成 | 可能（メーカー名は「富士ファーマ」固定） |

## エラーハンドリング

### 権限エラー時の動作

| 状況 | 動作 |
|-----|------|
| 他社シート編集試行 | ボタン無効化（UIで防止） |
| 他社アカウント編集試行 | ボタン無効化（UIで防止） |
| 他社メーカー名でアカウント作成試行 | バリデーションエラー表示 |
| STAFF がマスタ管理にアクセス | メニュー非表示（UIで防止） |

**バリデーションメッセージ例**:
```
「他社（富士ファーマ）のアカウントは作成・編集できません」
```

## まとめ

### 権限制御の3原則

1. **データ分離**: `manufacturerName` でデータを分離
2. **UI制御**: 権限のない操作はボタンを無効化・非表示
3. **バリデーション**: サーバーサイド（将来）で二重チェック

### 実装ファイル

| ファイル | 役割 |
|---------|------|
| [App.tsx](../App.tsx) | データフィルタリング |
| [Layout.tsx](../components/Layout.tsx) | メニュー表示制御 |
| [EntryList.tsx](../components/EntryList.tsx) | シート操作権限チェック |
| [AccountManage.tsx](../components/AccountManage.tsx) | アカウント操作権限チェック |
| [storage.ts](../services/storage.ts) | データ永続化 |
