# アカウント管理 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | ユーザーアカウントの追加、編集、削除を行う |
| 利用者 | `ADMIN`, `STAFF` |
| 到達条件 | ログイン後、`Page.ACCOUNTS`。`RETAILER` は到達不可 |
| 実装根拠 | `src/App.tsx`, `src/components/AccountManage.tsx`, `api/users.ts`, `api/users/[id].ts` |

## 表示条件/権限

| ロール | 一覧表示 | 追加 | 編集/削除 | 備考 |
| --- | --- | --- | --- | --- |
| ADMIN | 全ユーザー | 可 | 全ユーザー可 | 管理者/小売店/一般を選択可 |
| STAFF | 自社メーカーのユーザー | 可 | 自社メーカーかつADMIN以外 | 所属と権限は実質固定 |
| RETAILER | 不可 | 不可 | 不可 | ナビ非表示、`App.handleNavigate` でLISTへ戻す |

`App` は `ADMIN` 以外では `manufacturerName` がログインユーザーと一致するユーザーだけを `AccountManage` に渡す。

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| 一覧取得 | `GET /api/users` | ADMINは全件、非ADMINは自社メーカーのみ |
| 保存 | `PUT /api/users/:id` | `user` を送信し、API応答を正として一覧更新 |
| 削除 | `DELETE /api/users/:id` | 成功後、一覧から対象IDを除外 |
| マスタ参照 | `masterData.manufacturerNames`, `masterData.retailerNames` | 所属候補のselectに使用 |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ログインID | text input | 新規は空。編集は既存 `username` | 保存時 `trim()` | 必須 | 画面で空/重複を検証。APIでも必須/重複検証 | `User.username` | 編集可能ユーザー | 空、前後空白、重複IDを確認すること |
| 担当者名 | text input | 新規は空。編集は既存 `displayName` | 保存時 `trim()` | 必須 | 画面/APIで必須 | `User.displayName` | 編集可能ユーザー | 空保存不可、表示一覧へ反映されること |
| 所属（メーカー名/小売店名） | selectまたは自動表示 | STAFF新規は自社メーカー。ADMINは候補先頭 | 保存時 `trim()`。非ADMINはAPIで自社メーカーに上書き | 必須 | 画面/APIで必須。STAFFの他社指定は画面/APIで不可 | `User.manufacturerName` | ADMINはselect、STAFFは固定表示 | ADMINでロール変更時に候補種別が切り替わること |
| 権限 | selectまたは自動表示 | 新規は `STAFF` | ADMIN以外はAPIで `STAFF` に上書き | 必須 | 非ADMINがADMINを保存しようとすると画面/APIで不可 | `User.role` | ADMINはselect、STAFFは固定表示 | ADMIN/RETAILER/STAFFの表示ラベルを確認すること |
| メールアドレス | email input | 新規は空。編集は既存 `email` | `trim()` | 必須 | 画面でメール形式。APIは空のみ検証 | `User.email` | 編集可能ユーザー | 形式不正は画面で止まること。API直叩きとの差分を確認すること |
| 電話番号 | numeric input | 新規は空。編集は既存 `phoneNumber` | 全角数字を半角化し数字以外除去、最大11桁 | 必須 | 10から11桁の半角数字 | `User.phoneNumber` | 編集可能ユーザー | ハイフン/全角/12桁/9桁を確認すること |
| パスワード | password/text input | 新規は空。編集時は空表示 | `trim()` | 新規必須。編集時は任意 | 大文字/小文字/数字/記号を含む8文字以上。APIでも検証 | `User.password` | 編集可能ユーザー | 新規未入力、弱いPW、編集時未入力で維持を確認すること |
| パスワード表示 | アイコンボタン | 非表示 | なし | 任意 | なし | `isPasswordVisible` | 編集フォーム表示時 | 表示切替で入力値が保持されること |
| 画面内エラー | メッセージ | 空 | APIエラーを日本語化 | なし | 各保存エラー時に表示 | `validationError` | エラー時 | エラー後にキャンセル/保存成功でクリアされること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| 追加 | `handleAddNew` で `editingUser` を新規状態にする | STAFFでは所属が自社固定になること |
| 編集 | パスワードを除いたユーザー情報を `editingUser` にセット | 既存パスワードがフォームへ表示されないこと |
| キャンセル | `editingUser`, `validationError`, `isPasswordVisible` を初期化 | 入力途中の値が破棄されること |
| 保存 | 画面バリデーション後、`onSaveUser(newUser)` | API応答のユーザーで一覧が更新されること |
| 削除 | `window.confirm('本当に削除しますか？')` 後に `onDeleteUser(id)` | キャンセル時はAPIを呼ばないこと |

## API/保存時制約

| 制約 | 内容 |
| --- | --- |
| メソッド | `/api/users/:id` は `PUT` と `DELETE` のみ |
| 非ADMIN所属 | 既存または入力所属が現在ユーザーと異なる場合403 |
| 非ADMIN権限 | 非ADMINはADMINユーザー操作不可。保存時ロールは `STAFF` |
| 必須 | `username`, `displayName`, `manufacturerName`, `email`, `phoneNumber` |
| パスワード | 新規必須。未ハッシュ値は強度検証後にハッシュ化 |
| 最後の管理者 | 最後のADMINは削除不可 |
| 返却値 | `sanitizeUser` によりパスワードは返さない |

## エラー/例外

| ケース | 画面表示/挙動 |
| --- | --- |
| 必須不足 | `ログインID、担当者名、所属は必須です` など |
| 重複ID | `ログインID「...」は既に使用されています` |
| 他社操作 | `他社（...）のアカウントは作成・編集できません` |
| 管理者権限操作 | `管理者権限への変更は管理者ユーザーのみ可能です` |
| APIエラー | `getUserSaveErrorMessage` で日本語化して画面内表示 |
| 削除API失敗 | `App.handleDeleteUser` はconsole errorのみで画面alertなし |

## 保守テスト観点

- ADMINで各ロールを作成し、所属候補がメーカー/小売店で切り替わること。
- STAFFで自社ユーザーのみ表示され、他社/ADMINを操作できないこと。
- 編集時にパスワード未入力なら既存パスワードを維持すること。
- 削除時に最後の管理者はAPIで拒否されること。
- モバイルカード表示とデスクトップテーブル表示で編集/削除可否が一致すること。

