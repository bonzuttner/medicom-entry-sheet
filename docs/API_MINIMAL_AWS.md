# PharmaPOP Entry System - 最小API設計（AWS / 低運用コスト向け）

## 1. 目的

月額運用コストを抑えつつ、一般的な業務システムとして最低限必要なセキュリティを満たす。

- 目安運用予算: 月1万円前後
- 前提: 小規模トラフィック / 社内利用中心
- 方針: 「作り込み」より「事故を防ぐ基本対策を確実に」

## 2. 最小構成（推奨）

- フロント: `S3 + CloudFront`
- API: `API Gateway (HTTP API) + Lambda (Node.js/TypeScript)`
- 認証: `Amazon Cognito`
- データ: `DynamoDB`
- 画像: `S3`（アップロードは `presigned URL`）
- ログ監視: `CloudWatch Logs + CloudWatch Alarm`

## 3. セキュリティ基本方針

- 認証はCognitoのJWTのみ受け付ける
- 認可はAPI側で毎回実施（UI側チェックだけに依存しない）
- パスワードは平文保存しない（`scrypt` / `bcrypt` でハッシュ化）
- ログイン試行回数制限を実装（ブルートフォース対策）
- 秘密情報は `SSM Parameter Store` または `Secrets Manager` に保存
- APIはHTTPSのみ
- CORSは本番ドメインのみに限定
- 画像/添付はS3直アップロードでサイズ制限とMIME制限
- 監査ログ（失敗ログイン、削除、権限エラー）を残す

## 4. 認証・認可設計（最小）

### JWTクレーム（例）

- `sub`: ユーザーID
- `cognito:groups` または `custom:role`: `ADMIN` / `STAFF`
- `custom:manufacturer`: 所属メーカー名

### 認可ルール

- `ADMIN`: 全メーカーのデータ操作可
- `STAFF`: `manufacturerName === custom:manufacturer` のデータのみ可

## 5. APIエンドポイント（現在フロント実装に合わせた最小）

フロントの `src/services/dataService.ts` と整合させる。

### 認証系

- `POST /api/auth/login`  
  開発用のみ（本番ではCognito Hosted UI/SDKを使うため廃止推奨）

- `GET /api/current-user`
  - 認証済みユーザー情報を返す

- `DELETE /api/current-user`
  - セッション破棄

### データ系

- `GET /api/sheets`
  - `ADMIN`: 全件
  - `STAFF`: 自社のみ

- `PUT /api/sheets/{id}`
  - `STAFF` は自社データのみ更新可
  - 不正メーカー更新は `403`

- `DELETE /api/sheets/{id}`
  - 同上

- `GET /api/master`
  - 全ユーザー閲覧可

- `PUT /api/master`
  - `ADMIN` のみ可

- `GET /api/users`
  - `ADMIN`: 全件
  - `STAFF`: 自社のみ

- `PUT /api/users`
  - `ADMIN`: 全件更新可
  - `STAFF`: 自社ユーザーのみ更新可
  - 他社ユーザー混在なら `403`

### 画像アップロード

- `POST /api/files/presign`
  - 入力: `contentType`, `size`, `fileName`
  - 制約: 25MB以下、許可MIMEのみ（`image/jpeg`, `image/png`, `image/webp`）
  - 出力: `uploadUrl`, `key`, `publicUrl`（または取得API経由）

## 6. 入力バリデーション（サーバー側で必須）

- `title`: 空文字不可
- `janCode`: 8/13/16桁のみ
- `status=completed` の場合:
  - `productName`, `janCode`, `productImage` 必須
  - `hasPromoMaterial=yes` なら `promoWidth` と `promoImage` 必須
- 数値項目: `NaN` / 負数不可

## 7. DynamoDB設計（シンプル）

## 7.1 テーブル分割（運用優先）

- `users`（PK: `id`）
- `sheets`（PK: `id`, GSI: `manufacturerName`, `updatedAt`）
- `master`（PK: 固定キー `master#default`）

最初は分割テーブルでOK。単一テーブル最適化は後からで十分。

## 8. 監視・アラート（最低限）

- Lambda `5xx` エラー数アラーム
- API Gateway `4xx/5xx` 急増アラーム
- 認可エラー (`403`) 急増をログメトリクス化
- CloudWatch Logs保管: 30〜90日

## 9. IAM最小権限

- Lambdaごとに必要テーブル/バケットだけアクセス許可
- `*` 権限禁止
- 運用ユーザーは本番書き込みを最小化

## 10. 月1メンテ運用（30〜60分）

1. `npm audit` と依存更新確認
2. CloudWatchアラームとエラーログ確認
3. IAMポリシー棚卸し（不要権限削除）
4. DynamoDB PITRとS3バージョニング有効確認

## 11. 実装フェーズ（このリポジトリ向け）

1. `VITE_DATA_SOURCE=api` で動作する最小APIを `api/` に作る
2. APIでメーカー境界チェックを実装する
3. 画像保存をBase64からS3参照URLへ切り替える
4. Cognito連携を入れて `auth/login` の開発用APIを廃止する
