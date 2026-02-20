# AWS / S3 移行手順（計画）

このドキュメントは、次の2パターンを分けて説明します。

1. **AWSに移行する場合**（アプリ全体をAWS基盤へ寄せる）
2. **S3に移行する場合**（現行Vercel運用のまま、ファイル保存先だけS3へ変更）

## 先にどちらを選ぶか

- まず費用を抑えて保存容量だけ拡張したい: **B. S3のみ移行**
- 実行基盤や配信基盤もAWSへ統一したい: **A. AWS全体移行**
- 推奨順: **B を先に実施し、安定後に A を検討**

## 現行コードとの対応（最初に確認）

- API入口: `api/`
- DB接続: `api/_lib/db.ts`
- SQL実装: `api/_lib/repositories/*.ts`
- 画像/添付: `api/_lib/media.ts`, `api/upload.ts`
- DBスキーマ: `api/admin/schema.sql`

この5箇所を先に把握すると、移行チケットの分割がしやすい。

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

実施後の確認ポイント:
- `src/components/EntryForm.tsx` 側の変更が不要なこと（API互換）
- 既存URLのホスト許可設定（`MEDIA_ALLOWED_HOSTS`）が新ドメインに一致すること

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

### B-9. 運用クリティカル回帰テスト（必須）

本番切替前に、以下を `ADMIN` / `STAFF` の両ロールで実施する。

#### 1) エントリーシート保存

1. 新規作成 -> 一時保存（`draft`）が成功する
2. 同一シートを編集して再保存できる（更新時刻が更新される）
3. 新規作成 -> 完了（`completed`）が成功する
4. 2件目・3件目のシートも保存できる（単発成功のみで判断しない）
5. STAFF は自社メーカーのみ保存でき、他社データは `403` になる

#### 2) CSV出力

1. CSV出力が成功し、ファイルがダウンロードされる
2. 日本語（タイトル/商品名/メーカー名）が文字化けしない
3. 先頭が `= + - @` の値が安全化されて出力される（CSVインジェクション対策）
4. 複数シート選択時も件数欠落なく出力される

#### 3) 画像一括ダウンロード（ZIP）

1. 選択シートの画像が ZIP でダウンロードできる
2. ZIP名が `entry_sheet_images_YYYY-MM-DD.zip` 形式である
3. ZIP内ファイル名が `sheetId-productId-商品名.ext` 形式で一意である
4. 一部画像取得失敗時、成功分のみZIP化され、失敗件数が表示される
5. 画像ゼロ選択時はエラーでなくガイダンス表示になる

#### 4) DBバリデーション（運用上重要）

アプリ操作後にSQLで整合を確認する。

```sql
-- 基本件数
SELECT COUNT(*) FROM entry_sheets;
SELECT COUNT(*) FROM product_entries;
SELECT COUNT(*) FROM attachments;

-- 孤児レコード検知（0件が期待値）
SELECT COUNT(*) AS orphan_products
FROM product_entries p
LEFT JOIN entry_sheets s ON p.sheet_id = s.id
WHERE s.id IS NULL;

SELECT COUNT(*) AS orphan_ingredients
FROM product_ingredients pi
LEFT JOIN product_entries p ON pi.product_id = p.id
WHERE p.id IS NULL;

-- 添付の排他制約違反検知（0件が期待値）
SELECT COUNT(*) AS invalid_attachments
FROM attachments
WHERE (sheet_id IS NULL AND product_id IS NULL)
   OR (sheet_id IS NOT NULL AND product_id IS NOT NULL);
```

追加確認（アプリ/API側バリデーション）:
- マスタ値20文字超は保存拒否される
- 一般テキスト4000文字超は保存拒否される
- 画像（短辺1500px未満、50MB超）は拒否される
- 添付（25MB超）は拒否される

### B-10. 移行時に陥りやすいポイント確認テスト（必須）

#### 1) 接続先取り違え（環境/DB/Branch）

1. アプリ接続先と SQL Editor の接続先が同じかを確認（Project / Branch / Database）
2. `schema.sql` を適用したDBと、アプリが参照しているDBが一致しているか確認
3. `Production / Preview / Development` で環境変数が意図通り分かれているか確認

#### 2) 環境変数不足・差分

1. 必須キー（`POSTGRES_URL`, `SESSION_SECRET`, ストレージ用キー）が全環境に存在
2. `MEDIA_ALLOWED_HOSTS` に新ドメイン（S3/CloudFront）が含まれる
3. キー名のタイプミス（例: `_NON_POOLING` など）や古いキー残置がない

#### 3) 権限・認証の見落とし

1. `ADMIN` は全件、`STAFF` は自社のみ参照/保存できる
2. セッション切れ時に `401` となり、再ログインで復帰できる
3. `STAFF` でマスタAPIにアクセスすると `403` になる

#### 4) データ不整合（ID/参照）

1. UUID変換済みデータで `invalid input syntax for type uuid` が発生しない
2. `entry_sheets` と `product_entries` の参照切れがない
3. `attachments` の `sheet_id` / `product_id` 排他制約違反がない

#### 5) 保存できたように見えて反映されない問題

1. 保存直後に再取得 (`GET /api/sheets`) して、一覧へ反映されることを確認
2. 2件目・3件目保存時も反映されることを確認
3. 下書き/完了のステータス変更が一覧表示に反映されることを確認

#### 6) 画像移行特有の問題

1. 旧URLが許可ホスト外で拒否されないか（許可ドメイン設定を確認）
2. 画像MIMEの扱い差（特に非対応形式）で意図せず失敗していないか
3. 一括DL ZIP の拡張子・ファイル名重複が発生しないか

#### 7) 性能劣化の見落とし

1. シート保存の体感時間が移行前比で悪化していない
2. 画像アップロード時にUIが長時間無応答にならない
3. 一覧取得・CSV出力の処理時間が許容範囲内

#### 8) ロールバック不能リスク

1. DBバックアップ取得時刻を記録し、復元手順を実地確認
2. 旧環境へ戻すための環境変数セットを保存
3. 切替当日の担当者・判断基準・連絡経路を明文化

---

## C. 次段（推奨）

大容量運用では、API経由の base64 アップロードをやめて  
**署名付きURL（Presigned URL）でブラウザから直接S3へPUT** に移行すると、
速度・コスト・安定性がさらに改善します。

---

## D. 保守時チェックリスト（移行後運用）

### D-1. 日次（またはリリースごと）

1. 主要APIのエラーレート（`4xx/5xx`）を確認
2. シート保存API（`PUT /api/sheets/:id`）の失敗率を確認
3. 画像アップロードAPI（`POST /api/upload`）の失敗率を確認
4. CSV出力・画像一括DLのユーザー問い合わせ有無を確認

### D-2. 週次

1. DB整合性SQLを実行（孤児レコード、添付排他制約違反）
2. ストレージ利用量（S3/Blob）と増加傾向を確認
3. レート制限・認証失敗ログの急増有無を確認
4. 主要画面の操作スモークテスト（ログイン、一覧、保存、CSV、画像DL）

### D-3. 月次

1. 環境変数・秘密情報の棚卸し（不要キー削除、漏えい有無）
2. 依存パッケージの脆弱性確認と更新計画
3. バックアップ/リストア手順のリハーサル
4. ロールバック手順の再確認（直近構成に追従しているか）

### D-4. 変更作業前チェック（必須）

1. 変更対象がどの層かを明確化（API/DB/ストレージ/フロント）
2. 影響APIと影響テーブルを列挙
3. 回帰テスト対象を決定（B-9から抽出）
4. ロールバック条件と判断者を事前合意

### D-5. 変更作業後チェック（必須）

1. エントリーシート保存（draft/completed）が正常
2. CSV出力で日本語文字化けがない
3. 画像一括DL（ZIP）が正常
4. DB整合性SQLが全て期待値（違反0件）
5. 監視ダッシュボードでエラー率が通常範囲
