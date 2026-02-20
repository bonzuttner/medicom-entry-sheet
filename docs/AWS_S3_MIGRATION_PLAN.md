# AWS / S3 移行手順（計画）

このドキュメントは、次の2パターンを分けて説明します。

1. **AWSに移行する場合**（アプリ全体をAWS基盤へ寄せる）
2. **S3に移行する場合**（現行Vercel運用のまま、ファイル保存先だけS3へ変更）

## 先にどちらを選ぶか

- まず費用を抑えて保存容量だけ拡張したい: **B. S3のみ移行**
- 実行基盤や配信基盤もAWSへ統一したい: **A. AWS全体移行**
- 推奨順: **B を先に実施し、安定後に A を検討**

---

## A. AWSに移行する場合（全体移行）

### A-1. 対象範囲

- フロント: Vercel から AWS 配信基盤（例: S3 + CloudFront）へ
- API: Vercel Functions から AWS 実行基盤（例: Lambda / ECS）へ
- DB: Neon継続 or AWS側DBへ移行（要判断）
- ファイル: Vercel Blob から S3へ

### A-2. 事前準備

1. AWSアカウント/請求設定
2. IAMロール設計（最小権限）
3. ネットワーク設計（必要ならVPC）
4. ログ監視設計（CloudWatch）
5. 秘密情報管理（SSM/Secrets Manager）

### A-3. 移行ステップ

1. 先にファイル保存を S3 化（B手順）して依存を減らす
2. API実行基盤を AWS 側へ移行
3. フロント配信を AWS 側へ移行
4. DNS 切替（段階）
5. 監視しながらトラフィック移行

### A-3.1 実行単位（作業チケット化の目安）

1. ストレージ移行（Blob -> S3）完了
2. API基盤移行（Vercel Functions -> Lambda/ECS）完了
3. フロント配信移行（Vercel -> S3/CloudFront）完了
4. 本番切替（DNS/監視/ロールバック計画）完了

### A-4. 注意点

- 全体移行は影響範囲が広いため、**段階移行** を前提にする
- まずは「S3のみ移行」してから全体移行するのが安全

---

## B. S3に移行する場合（保存先のみ移行）

### B-1. 対象範囲

- 変更対象: 画像・添付の保存先
- 継続利用: フロント（React）、API（Vercel Functions）、DB（Neon）

### B-2. 事前準備

1. S3 バケット作成
2. IAM ユーザー/ロール作成（最小権限）
3. 必要に応じて CloudFront 作成
4. 依存追加:
   - `@aws-sdk/client-s3`
   - （Presigned URL利用時）`@aws-sdk/s3-request-presigner`
5. 環境変数追加:
   - `AWS_REGION`
   - `S3_BUCKET`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_PUBLIC_BASE_URL`（CloudFront利用時）
   - `MEDIA_ALLOWED_HOSTS`（S3/CloudFrontドメインを追加）

CloudFront利用時の前提:
- S3バケットは原則非公開
- CloudFront OAC/OAI でS3へアクセス
- アプリには CloudFront ドメインを公開URLとして設定

### B-3. バックエンド実装差し替え

対象: `api/_lib/media.ts`

1. `put/del`（Vercel Blob）を S3 SDK に置換
2. URL生成を S3/CloudFront に統一
3. `isAllowedHost` を S3/CloudFront ドメイン対応に変更
4. 既存のサイズ/解像度検証ロジックは維持
5. `api/upload.ts` の `BLOB_READ_WRITE_TOKEN` 必須チェックを、
   S3向け環境変数チェック（`AWS_REGION`/`S3_BUCKET`/認証情報）へ変更
6. `api/upload.ts` のレスポンス形式（`{ url }`）は互換維持

### B-4. API互換維持

- `api/upload.ts` のインターフェースは当面維持
- フロント（`src/components/EntryForm.tsx`）は極力変更しない

### B-5. 既存データ移行

1. 既存 Blob URL 一覧を抽出
2. ファイルを S3 へコピー
3. DB の URL を S3/CloudFront URL へ置換
4. 移行検証後に旧Blobを段階削除

安全実行の追加手順:
1. URL置換前にDBバックアップ取得
2. URL置換は段階実行（件数制限つき）
3. 置換後の検証クエリで件数確認
4. 問題時はロールバックSQL（バックアップから復元）を実行

### B-6. 動作確認

- 画像アップロード/表示/削除
- 添付アップロード/ダウンロード
- シート保存（下書き/完了）
- CSV出力・画像一括DL
- 権限（ADMIN/STAFF）ごとの利用確認

### B-7. 切替とロールバック

- 切替手順:
  1. 環境変数を本番へ設定
  2. デプロイ
  3. 監視（エラー率/レスポンス）
- ロールバック:
  - 旧保存実装へ戻して再デプロイ
  - URL置換を実施している場合は逆変換スクリプトを準備

### B-8. 最終チェックリスト（本番切替前）

1. `api/upload.ts` が S3 用環境変数チェックに切り替わっている
2. `api/_lib/media.ts` の URL 生成先が S3/CloudFront になっている
3. `MEDIA_ALLOWED_HOSTS` に配信ドメインが含まれている
4. 画像アップロード・表示・削除がすべて成功する
5. 失敗時のロールバック手順が手元で再現確認済み

---

## C. 次段（推奨）

大容量運用では、API経由の base64 アップロードをやめて  
**署名付きURL（Presigned URL）でブラウザから直接S3へPUT** に移行すると、
速度・コスト・安定性がさらに改善します。
