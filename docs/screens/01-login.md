# ログイン 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | ユーザー認証を行い、成功時にログインセッションを作成する |
| 利用者 | `ADMIN`, `STAFF`, `RETAILER` |
| 到達条件 | `currentUser` が存在しないこと |
| 実装根拠 | `src/components/Login.tsx`, `src/services/dataService.ts`, `api/auth/login.ts`, `src/services/apiClient.ts` |

## 表示条件/権限

| 条件 | 表示内容 |
| --- | --- |
| 未ログイン | ログインフォームを表示 |
| ログイン済み | `App` が `Page.LIST` を表示し、ログイン画面は表示しない |

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| ログイン | `POST /api/auth/login` | `username`, `password` を送信する |
| セッション | `setSessionCookie(res, user.id)` | ログイン成功時にHttpOnlyセッションCookieを設定 |
| ログイン後初期化 | `App.handleLogin` | `currentUser` 設定、`Page.LIST` 遷移、シート/ユーザー/マスタ読込 |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ログインID | text input | 空文字 | API側で `trim()` | HTML `required`、APIも必須 | 空ならAPIが `username and password are required` | 送信のみ | 未ログイン時 | 空送信がブラウザ/HTMLで止まること。前後空白はAPIで除去されること |
| パスワード | password/text input | 空文字 | なし | HTML `required`、APIも必須 | 空ならAPIが `username and password are required` | 送信のみ | 未ログイン時 | 表示切替しても値が保持されること |
| パスワード表示 | アイコンボタン | 非表示 | なし | 任意 | なし | `showPassword` state | 未ログイン時 | 押下で `password`/`text` が切り替わること |
| エラー表示 | メッセージ領域 | 空 | なし | なし | ログイン結果または例外で表示 | `error` state | エラー時のみ | 認証失敗とAPI例外で文言が変わること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| ログイン送信 | `handleSubmit` が `preventDefault()` し、`dataService.login(username, password)` を呼ぶ | 正しいID/PWで一覧へ遷移すること |
| 認証成功 | APIがユーザーを返す。`onLogin(user)` 実行 | セッションCookieが作成され、更新後もログイン状態が維持されること |
| 認証失敗 | APIが `200 null` を返す。画面は `IDまたはパスワードが正しくありません` を表示 | 誤ったPWで画面遷移しないこと |
| API例外 | `catch` で `ログイン処理に失敗しました。時間をおいて再試行してください。` を表示 | 429/500などでも画面が落ちないこと |

## API/保存時制約

| 制約 | 内容 |
| --- | --- |
| メソッド | `POST` のみ。その他はMethod not allowed |
| ユーザー名 | `String(username || '').trim()` で正規化 |
| レート制限 | ログイン失敗が上限に達すると `429` と `Retry-After` を返す |
| パスワード照合 | `verifyPassword(password, user.password)` |
| 失敗時 | 認証失敗時はログイン失敗を記録し、セッションCookieを削除して `null` を返す |

## エラー/例外

| ケース | 画面表示 | API/内部挙動 |
| --- | --- | --- |
| ID/PW不一致 | `IDまたはパスワードが正しくありません` | `recordLoginFailure`, `clearSessionCookie` |
| IDまたはPW未入力 | HTML requiredで送信不可。API直叩きでは400 | `username and password are required` |
| レート制限 | 画面は汎用エラー表示 | APIは429、`Retry-After` あり |
| API通信失敗 | 汎用エラー表示 | `console.error('Login failed:', err)` |

## 保守テスト観点

- 正常ログイン後に `Page.LIST` が表示されること。
- ログイン後に `getSheetsPage`, `getUsers`, `getMasterData` が呼ばれ、ロールに応じたデータが表示されること。
- 誤ったパスワードではセッションが残らないこと。
- パスワード表示/非表示を切り替えてから送信しても同じ値で認証されること。
- レート制限時はAPIが429を返し、画面がクラッシュしないこと。

