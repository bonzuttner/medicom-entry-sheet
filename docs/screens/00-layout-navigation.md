# 共通ヘッダー/ナビゲーション 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | ログイン後の共通ヘッダー、ユーザー情報、画面遷移、ログアウトを提供する |
| 利用者 | `ADMIN`, `STAFF`, `RETAILER` |
| 到達条件 | `currentUser` が存在すること |
| 実装根拠 | `src/components/Layout.tsx`, `src/App.tsx` |

## 表示条件/権限

| 要素 | ADMIN | STAFF | RETAILER | ロジック |
| --- | --- | --- | --- | --- |
| シート一覧 | 表示 | 表示 | 表示 | `Page.LIST` へ遷移。`Page.EDIT` 中もアクティブ表示 |
| アカウント管理 | 表示 | 表示 | 非表示 | `currentUser.role !== UserRole.RETAILER` |
| マスタ管理 | 表示 | 非表示 | 非表示 | `currentUser.role === UserRole.ADMIN` |
| エントリー履歴（Admin） | 表示 | 非表示 | 非表示 | `currentUser.role === UserRole.ADMIN` |
| ログアウト | 表示 | 表示 | 表示 | `onLogout` 実行 |

`src/App.tsx` 側でも、権限外ページへの遷移は `Page.LIST` に戻す。`Page.RETAILER_LIST` は現行では `Page.LIST` に置換される。

## データ取得/保存

| 処理 | 内容 |
| --- | --- |
| 初期表示 | `App` が `dataService.getCurrentUser()` を呼び、ログイン済みなら `Page.LIST` を表示する |
| 補助データ | ログイン後に `getSheetsPage`, `getUsers`, `getMasterData` を読み込む |
| ログアウト | `handleLogout` が `currentUser`, `sheets`, `users`, `masterData`, ページング状態を初期化し、`DELETE /api/current-user` を呼ぶ |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| サービス名 | テキスト/クリック領域 | `PharmaPOP Entry` 固定 | なし | なし | なし | なし | ログイン後全員 | クリックで `Page.LIST` に戻ること |
| 表示名 | テキスト | `currentUser.displayName` | なし | なし | なし | なし | md以上で表示 | ログインユーザーと一致すること |
| 所属名 | テキスト | `currentUser.manufacturerName` | なし | なし | なし | なし | md以上で表示 | STAFF/RETAILERでも正しい所属が表示されること |
| 権限名 | テキスト | `ADMIN` は `管理者`, `RETAILER` は `小売店`, その他は `一般` | なし | なし | なし | なし | md以上で表示 | ロール表示が正しいこと |
| ナビボタン | ボタン | 現在ページでアクティブ表示 | なし | なし | `App.handleNavigate` で権限外遷移をLISTへ戻す | なし | ロールごとに表示制御 | 非表示画面へ直接遷移を試みてもLISTに戻ること |
| ログアウト | アイコンボタン | 常時表示 | なし | なし | 失敗時はconsole errorのみ | セッションCookie削除 | ログイン後全員 | 押下後ログイン画面へ戻り、一覧データが消えること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| ロゴ押下 | `onNavigate(Page.LIST)` | 編集画面から一覧へ戻ること |
| シート一覧押下 | `Page.LIST` へ遷移 | 全ロールで表示されること |
| アカウント押下 | `Page.ACCOUNTS` へ遷移 | RETAILERでは表示されないこと |
| マスタ押下 | `Page.MASTERS` へ遷移 | STAFF/RETAILERでは表示されないこと |
| 履歴押下 | `Page.ADMIN_LIST` へ遷移 | ADMINのみ表示されること |
| ログアウト押下 | `handleLogout` 実行 | API失敗時の挙動、再ログイン後の初期表示を確認する |

## エラー/例外

| ケース | 挙動 |
| --- | --- |
| 未ログイン | `Layout` は表示されず `Login` を表示 |
| 権限外ページ遷移 | `App.handleNavigate` が `Page.LIST` へ戻す |
| ログアウト失敗 | `console.error('Failed to clear login session:', error)` のみ |

## 保守テスト観点

- ロール別にナビ表示が期待通りであること。
- `Page.EDIT` ではシート一覧ナビがアクティブ扱いになること。
- RETAILERでアカウント管理が表示されず、直接遷移もLISTへ戻ること。
- ADMIN以外でマスタ管理/Admin履歴へ直接遷移してもLISTへ戻ること。
- ログアウト後にブラウザ更新してもログイン画面のままであること。

