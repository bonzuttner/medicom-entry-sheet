# 画面設計書

## 目的

本ディレクトリは、保守テストで画面ごとの表示条件、入力項目、操作、保存時制約を確認するための画面設計書を管理する。

実装根拠は主に `src/App.tsx`, `src/components/`, `src/services/dataService.ts`, `api/` である。画面仕様を変更した場合は、該当コンポーネントと同時に本ディレクトリの文書も更新する。

## 対象画面

現在 `src/App.tsx` から到達できる画面のみを対象とする。

| No | 画面 | ファイル | 主な実装 |
| --- | --- | --- | --- |
| 00 | 共通ヘッダー/ナビゲーション | [00-layout-navigation.md](00-layout-navigation.md) | `src/components/Layout.tsx`, `src/App.tsx` |
| 01 | ログイン | [01-login.md](01-login.md) | `src/components/Login.tsx`, `api/auth/login.ts` |
| 02 | エントリーシート履歴 | [02-entry-list.md](02-entry-list.md) | `src/components/EntryList.tsx` |
| 03 | エントリーシート登録・編集 | [03-entry-form.md](03-entry-form.md) | `src/components/EntryForm.tsx`, `api/sheets/[id].ts` |
| 04 | アカウント管理 | [04-account-manage.md](04-account-manage.md) | `src/components/AccountManage.tsx`, `api/users/[id].ts` |
| 05 | マスタ管理 | [05-master-manage.md](05-master-manage.md) | `src/components/MasterManage.tsx`, `api/master.ts` |
| 06 | エントリー履歴（Admin） | [06-admin-entry-list.md](06-admin-entry-list.md) | `src/components/AdminEntryList.tsx` |

`src/components/RetailerEntryList.tsx` は現行の `src/App.tsx` から到達しないため、画面設計書の対象外とする。

## 権限別の到達可否

| 画面 | ADMIN | STAFF | RETAILER | 備考 |
| --- | --- | --- | --- | --- |
| ログイン | 可 | 可 | 可 | 未ログイン時のみ表示 |
| 共通ヘッダー/ナビ | 可 | 可 | 可 | ログイン後のみ表示 |
| エントリーシート履歴 | 可 | 可 | 可 | APIと画面側で参照範囲を制御 |
| エントリーシート登録・編集 | 可 | 可 | 可 | 作成/編集権限はメーカー境界で制御 |
| アカウント管理 | 可 | 可 | 不可 | RETAILER はナビ非表示、遷移ガードあり |
| マスタ管理 | 可 | 不可 | 不可 | ADMIN のみ |
| エントリー履歴（Admin） | 可 | 不可 | 不可 | ADMIN のみ |

## 読む順番

1. [00-layout-navigation.md](00-layout-navigation.md) で全体の画面遷移と権限ガードを確認する。
2. [03-entry-form.md](03-entry-form.md) で最も項目数が多い登録・編集ロジックを確認する。
3. 一覧、Admin、アカウント、マスタの順に業務別の保守テスト観点を確認する。

## 共通テスト観点

| 観点 | 確認内容 |
| --- | --- |
| 権限 | ロールごとのナビ表示、遷移ガード、API側の403を確認する |
| 入力変換 | 全角数字、空白、URL、JAN、電話番号などの正規化を確認する |
| 保存 | UIで止める検証とAPIで止める検証の両方を確認する |
| エラー | `alert`, 画面内エラー、APIエラー文言の表示差分を確認する |
| レスポンシブ | 一覧系はモバイルカード表示とデスクトップテーブル表示を確認する |

