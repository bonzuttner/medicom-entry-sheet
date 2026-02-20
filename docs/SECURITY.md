# PharmaPOP Entry System - セキュリティ設計書

## 1. 目的

本書は、PharmaPOP Entry System のセキュリティ実装方針を定義する。
実装変更時は本書も更新し、設計と実装の不一致を防ぐ。

## 2. 対象範囲

- フロントエンド: `src/`
- API: `api/`
- データ保存:
  - 本番運用: PostgreSQL（Vercel Postgres / Neon）
  - 開発用: API（`vercel dev`）

## 3. 保護対象

- ユーザー情報（ID、所属メーカー、ロール）
- 認証情報（パスワード、セッション）
- エントリーシート・商品・添付ファイル
- マスターデータ

## 4. 脅威モデル

- 認証回避（なりすまし）
- ブルートフォース攻撃
- 他社データへの不正アクセス（テナント境界突破）
- パスワード漏えい
- 不正ファイルアップロード

## 5. セキュリティ方針

- 認証・認可は API 側で必ず実施する
- UI の表示制御は補助とし、データ保護の本体にしない
- パスワードは平文保存しない（`scrypt`）
- セッションは署名付き Cookie で管理する
- ログイン試行を制限する
- 画像/添付は MIME・サイズ・解像度を検証する

## 6. 実装状況

### 6.1 認証

- `POST /api/auth/login` で認証
- 成功時にセッション Cookie を発行
- 未認証アクセスは `401`

実装:
- `api/auth/login.ts`
- `api/_lib/auth.ts`
- `api/_lib/http.ts`

### 6.2 パスワード保護

- 形式: `scrypt$salt$hash`
- `PASSWORD_PEPPER` を連結してハッシュ
- 平文データ互換の照合ロジックあり（移行互換）

実装:
- `api/_lib/password.ts`

### 6.3 セッション管理

- Cookie名: `pharmapop_session_user`
- 値: `userId.signature`（HMAC-SHA256）
- 属性: `HttpOnly`, `SameSite=Lax`, `Max-Age=12h`
- `NODE_ENV=production` では `Secure` を付与

実装:
- `api/_lib/http.ts`

### 6.4 認可（ロール・メーカー境界）

- `ADMIN`: 全メーカー操作可
- `STAFF`: 自社メーカーのみ操作可
- APIで毎回 `requireUser` + 境界チェック
- マスターデータ API:
  - `GET /api/master` は認証済みユーザー全員可（入力用参照）
  - `PUT /api/master` は `ADMIN` のみ可（更新）

実装:
- `api/_lib/auth.ts`
- `api/sheets.ts`
- `api/sheets/[id].ts`
- `api/users.ts`
- `api/users/[id].ts`
- `api/master.ts`

### 6.5 ログイン試行制限

- 単位: `IP + username`
- 15分で5回失敗すると15分ロック
- ロック中は `429` + `Retry-After`

実装:
- `api/_lib/loginRateLimit.ts`
- `api/auth/login.ts`

補足:
- 現状の試行回数ストアは `/tmp/pharmapop-login-attempts.json` を使用（サーバーレス環境では永続保証なし）

### 6.6 画像・添付ファイル検証

- 商品画像:
  - 50MB以下
  - 短辺1500px未満は拒否
  - MIME制限あり
- 添付ファイル:
  - 25MB以下
  - MIME制限あり
- クライアントと API の両方で検証

実装:
- `src/components/EntryForm.tsx`
- `api/_lib/media.ts`

### 6.7 データアクセス

- 現行実装は API 固定
- 開発時も `vercel dev` 経由で API を利用

実装:
- `src/services/dataService.ts`

## 7. 環境変数（セキュリティ関連）

必須:
- `SESSION_SECRET`（本番ランタイムでは必須）

推奨:
- `PASSWORD_PEPPER`

## 8. 運用チェック

1. `401/403/429` の増加を監視
2. 依存パッケージの脆弱性を定期確認
3. `SESSION_SECRET` / `PASSWORD_PEPPER` の管理・ローテーションを確認
4. 画像アップロード失敗率（サイズ・解像度）を確認

## 9. 既知の制約

- レート制限カウンタの `/tmp` 保存は耐障害性が弱い（将来は Redis 等へ移行推奨）
- MFA/CAPTCHA は未実装

## 10. 更新履歴

- 2026-02-20: 実装現状（API認証・認可、画像検証、レート制限）に合わせて全面更新
