# PharmaPOP Entry System - セキュリティ設計書

## 1. 目的

本書は、PharmaPOP Entry System のデータ保護と不正利用防止のための設計方針を定義する。
実装変更時は本書を更新し、設計と実装の乖離を防ぐ。

## 2. 対象範囲

- フロントエンド: `src/`
- APIモック/将来の本番APIの雛形: `api/`
- データ保存:
  - 開発モード: LocalStorage
  - APIモード: `/tmp` 永続化ファイル（モック）
- 認証/認可、セッション管理、入力検証、監視運用

## 3. 守る対象（保護資産）

- ユーザー情報（ID、所属メーカー、権限）
- 認証情報（パスワード、セッション）
- エントリーシート・商品情報・画像データ
- マスターデータ

## 4. 脅威モデル

- なりすましログイン（認証回避、セッション改ざん）
- ブルートフォースログイン
- 他社データの閲覧・更新（権限境界突破）
- パスワード漏えい
- 画像/履歴データの過剰保持による漏えい範囲拡大

## 5. セキュリティ方針

- 認証はAPI側で実施し、UI制御のみで完結させない
- 認可はAPI側で毎回実施する
- パスワードは平文保存しない（`scrypt` ハッシュ）
- セッションは署名付きCookieで改ざん検知する
- ログイン試行回数を制限する
- データ保持期間を定め、古い履歴は削除する
- 本番ビルドは `api` データソースを強制する

## 6. 現在の実装

### 6.1 認証

- ログイン: `POST /api/auth/login`
- パスワード照合: `verifyPassword`（`scrypt`）
- 成功時: セッションCookie発行
- 失敗時: セッションCookie破棄

実装参照:
- `api/auth/login.ts`
- `api/_lib/password.ts`

### 6.2 パスワード保護

- 保存時は `scrypt$salt$hash` 形式で保存
- 初期データもハッシュ済みで作成
- 既存平文データは読み込み時に自動移行

実装参照:
- `api/_lib/password.ts`
- `api/_lib/initialData.ts`
- `api/_lib/store.ts`

### 6.3 セッション管理

- Cookie名: `pharmapop_session_user`
- 値: `userId.signature`（HMAC-SHA256）
- 属性: `HttpOnly`, `SameSite=Lax`, `Max-Age=12h`
- 本番時は `Secure` を自動付与

実装参照:
- `api/_lib/http.ts`
- `api/_lib/auth.ts`

### 6.4 ブルートフォース対策

- 単位: `IP + username`
- 制限: 15分間に5回失敗で15分ロック
- ロック時: `429` + `Retry-After`
- 成功時: 失敗カウンタ削除

実装参照:
- `api/_lib/loginRateLimit.ts`
- `api/auth/login.ts`

### 6.5 認可（マルチテナント境界）

- `ADMIN`: 全メーカー操作可
- `STAFF`: 自社メーカーのみ操作可
- API側で `requireUser` とメーカー境界チェックを適用

実装参照:
- `api/_lib/auth.ts`
- `api/users.ts`
- `api/sheets.ts`
- `api/sheets/[id].ts`
- `api/master.ts`

### 6.6 データ保持

- エントリーシート履歴は3年保持
- 保持期間超過分は自動削除
- 画像はシート内に保持され、参照中のものは残る

実装参照:
- `src/services/storage.ts`
- `api/_lib/retention.ts`
- `api/sheets.ts`
- `api/sheets/[id].ts`

### 6.7 本番時データソース制御

- 開発時: `VITE_DATA_SOURCE` で `local/api` 切替
- 本番ビルド: `api` を強制

実装参照:
- `src/services/dataService.ts`

## 7. 秘密情報管理

- 必須:
  - `SESSION_SECRET`
- 推奨:
  - `PASSWORD_PEPPER`
- 本番では環境変数を安全なストアで管理する
  - AWS: `Secrets Manager` または `SSM Parameter Store`

## 8. 運用チェックリスト（月次）

1. ログイン失敗増加（429/401）を監視確認
2. 権限エラー（403）急増の確認
3. 依存パッケージの脆弱性確認
4. 秘密情報ローテーション状況確認
5. 3年保持ルールが期待通り動作しているか確認

## 9. 既知の制約

- LocalStorageモードは開発用であり、本番利用しない
- APIモックの `/tmp` 保存は本番用途ではない
- CAPTCHA/MFA は未実装（将来 Cognito 側で対応）

## 10. 更新ルール

- セキュリティ関連の実装を変更したPRでは本書更新を必須化する
- 更新時は以下を最低記載する
  - 変更目的
  - 影響範囲
  - ロールバック方法

## 11. 更新履歴

- 2026-02-08: 初版作成（認証・認可・ハッシュ化・レート制限・保持期間を反映）
