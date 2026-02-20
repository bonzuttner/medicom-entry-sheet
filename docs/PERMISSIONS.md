# PharmaPOP Entry System - 権限設計書

## 概要

本システムは `ADMIN` と `STAFF` の2ロールで権限を管理します。
権限判定は **API側で必ず実施** し、UI表示制御は補助として扱います。

## ロール定義

### ADMIN

- 対象: システム管理者
- 権限範囲: 全メーカーのデータ
- マスターデータ: 閲覧・更新可能
- ユーザー管理: 全メーカーのユーザー管理可能

### STAFF

- 対象: 一般ユーザー
- 権限範囲: 自社メーカーのデータのみ
- マスターデータ: 入力用参照は可、更新不可
- ユーザー管理: 自社メーカーの `STAFF` ユーザーのみ管理可能

## 権限マトリクス

| 機能 | ADMIN | STAFF |
|---|---|---|
| エントリーシート一覧閲覧 | 全件 | 自社のみ |
| エントリーシート作成・更新・削除 | 可能 | 自社のみ |
| アカウント一覧閲覧 | 全件 | 自社のみ |
| アカウント作成・更新・削除 | 全件 | 自社 `STAFF` のみ |
| マスターデータ参照（入力用） | 可能 | 可能 |
| マスターデータ更新（管理） | 可能 | 不可 |
| 移行API実行 | 可能 | 不可 |

## API側の実装ポイント

### 認証

- 共通認証: `api/_lib/auth.ts`
- 各APIで `requireUser` を実行し、未認証は `401`

### 認可（メーカー境界）

- 共通判定: `canAccessManufacturer` (`api/_lib/auth.ts`)
- シート系API:
  - `api/sheets.ts`
  - `api/sheets/[id].ts`
- ユーザー系API:
  - `api/users.ts`
  - `api/users/[id].ts`

### 管理者限定API

- マスター更新: `api/master.ts` の `PUT`（`ADMIN` のみ）
- 移行処理:
  - `api/admin/migrate.ts`
  - `api/admin/migrate-to-postgres.ts`

## UI側の表示制御（補助）

- マスタ管理メニューは `ADMIN` のみ表示: `src/components/Layout.tsx`
- 一覧画面の編集/削除ボタンは権限に応じて無効化:
  - `src/components/EntryList.tsx`
  - `src/components/AccountManage.tsx`

## 重要注意

- UIの非表示・無効化だけでは権限制御として不十分です。
- 実際のデータ保護は API 側の `401/403` 応答で担保します。
