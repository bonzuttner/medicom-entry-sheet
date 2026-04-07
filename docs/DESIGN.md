# PharmaPOP Entry System - システム設計書

## 1. 目的

本書は、現在の実装に基づいてシステム全体の設計を説明する。
「フロントエンド / API / DB」の責務境界と主要データフローを、初見のエンジニアが把握できることを目的とする。

## 2. システム構成

### 2.1 構成概要

- フロントエンド: React + TypeScript + Vite（`src/`）
- バックエンド: Vercel Functions（`api/`）
- DB: PostgreSQL（Vercel Postgres / Neon）
- 画像/添付: Vercel Blob

### 2.2 実行モード

- 開発/本番ともに API を利用
- ローカル確認は `vercel dev` で `api/` を起動

## 3. ディレクトリ責務

### 3.1 フロントエンド

- `src/App.tsx`: 画面遷移・状態管理の中心
- `src/components/`
  - `EntryList.tsx`: エントリー履歴一覧
  - `AdminEntryList.tsx`: Admin向け一覧（Adminメモの行内編集）
  - `EntryForm.tsx`: 登録・編集フォーム
  - `AccountManage.tsx`: アカウント管理
  - `MasterManage.tsx`: マスタ管理
  - `Layout.tsx`: ナビゲーション
- `src/services/`
  - `dataService.ts`: APIアクセス
  - `apiClient.ts`: API呼び出し

### 3.2 バックエンド

- `api/_lib/`
  - `auth.ts`: 認証・認可ヘルパー
  - `http.ts`: HTTP共通処理（JSON/セッションCookie等）
  - `db.ts`: DB接続・トランザクション
  - `password.ts`: パスワードハッシュ/照合
  - `media.ts`: 画像・添付の検証/Blob保存
  - `repositories/`: 各テーブルのデータアクセス
- `api/*.ts`: APIエンドポイント
  - `api/auth/login.ts`
  - `api/current-user.ts`
  - `api/sheets.ts`, `api/sheets/[id].ts`
  - `api/sheets/[id]/revisions.ts`
  - `api/users.ts`, `api/users/[id].ts`
  - `api/master.ts`
  - `api/products/search.ts`
  - `api/upload.ts`
  - `api/admin/*`（移行系）

### 3.4 バックエンド内部の責務分離

- API層（`api/*.ts`）:
  - 認証・認可、リクエストバリデーション、レスポンス制御
- ドメイン共通層（`api/_lib/*.ts`）:
  - 認証、セッション、メディア処理、DB接続、パスワード処理
- 永続化層（`api/_lib/repositories/*.ts`）:
  - SQL定義とテーブル更新整合を担当

移行時の原則:
- 実行基盤移行（Vercel -> AWS）は API層+共通層が主対象
- DB移行（Neon -> RDS/Aurora）は `db.ts` とSQL互換確認が主対象
- ストレージ移行（Blob -> S3）は `media.ts` が主対象

### 3.3 DB設計

- スキーマ定義: `api/admin/schema.sql`
- 主要テーブル:
  - `manufacturers`
  - `users`
  - `entry_sheets`
  - `entry_sheet_admin_memos`
  - `manufacturer_products`
  - `manufacturer_product_ingredients`
  - `product_entries`
  - `product_ingredients`
  - `attachments`
  - `master_data`
  - `manufacturer_shelf_names`
  - `manufacturer_case_names`
  - `manufacturer_default_start_months`
  - `manufacturer_face_options`
  - `manufacturer_code_sequence`
  - `sheet_code_sequences`
  - `entry_sheet_revisions`

## 4. データモデル（アプリ）

型定義は `src/types.ts` と `api/_lib/types.ts` にある。

- `User`: `ADMIN` / `STAFF` を持つ
- `EntrySheet`: シートヘッダ情報 + `products`
  - `sheetCode` を保持（業務用シートID、表示/CSV用）
  - `deploymentStartMonth` を保持
  - `faceLabel`, `faceMaxWidth` を保持（選択したフェイス設定）
  - `version` を保持（競合制御）
  - `status`: `draft` / `completed` / `completed_no_image`
  - `entryStatus`, `creativeStatus`, `currentAssignee`, `returnReason` を保持（ワークフロー管理）
  - `assigneeUserId` を保持（実担当者。`users.id` を参照）
  - `assigneeUsername` を返却時に保持（表示用の担当者名。内部的には `displayName` を優先し、未設定時は `username` を用いる）
  - `adminMemo` を保持（編集は ADMIN のみ、`entry_sheet_admin_memos` に分離保存）
- `Creative`: 画像1枚単位のクリエイティブ
  - `creatorId`, `creatorName`
  - `name`, `imageUrl`, `memo`
  - `linkedSheets`
- `creative_entry_sheets`: Creative と EntrySheet の紐づき中間テーブル
- `ProductEntry`: シート保存時点の商品スナップショット（JAN、画像、販促物情報など）
- `manufacturer_products`: メーカー内で JAN 一意の検索用商品マスタ
  - `lastUsedAt` を保持し、最終利用から2年で削除対象
- `MasterData`: メーカー名・リスク分類・特定成分・メーカー別棚割名・メーカー別案件・メーカー別デフォルト展開スタート月・メーカー別フェイス設定

補足:
- APIでは `manufacturer_id`（UUID FK）で正規化しつつ、UIには `manufacturerName` を返す
- メーカーには `code`（3桁）を採番し、シートには `sheet_code`（メーカーコード3桁 + 連番5桁）を採番する

## 5. API設計（要点）

### 5.1 認証・セッション

- ログイン: `POST /api/auth/login`
- 現在ユーザー: `GET /api/current-user`
- ログアウト: `DELETE /api/current-user`
- セッションCookieは `HttpOnly`、署名付き

### 5.2 権限

- `ADMIN`: 全メーカーアクセス可
- `STAFF`: 自社メーカーのみアクセス可
- マスタAPI（`/api/master`）:
  - `GET`: 認証済みユーザー全員可（入力用マスタ参照）
    - STAFF には `manufacturerNames: []` を返却（他社メタ情報の露出防止）
  - `PUT`: `ADMIN` のみ可（マスタ更新）
- 権限制御は API 側で実施（UIは補助）

### 5.3 主要API

- シート一覧: `GET /api/sheets`
  - `offset/limit` 指定時は `{ items, hasMore, totalCount }` を返却
- シート保存: `PUT /api/sheets/:id`
  - 通常保存（シート全体）と `mode=admin_memo`（Adminメモのみ）に対応
  - `version` 不一致時は `409 VERSION_CONFLICT`
  - JAN重複時は `409 JAN_CONFLICT`
- シート削除: `DELETE /api/sheets/:id`
- シート変更履歴: `GET /api/sheets/:id/revisions`
  - 通常シート項目の変更のみ記録
  - Adminメモ更新は履歴対象外
- 過去商品検索: `GET /api/products/search`
- ユーザー一覧: `GET /api/users`
- ユーザー保存: `PUT /api/users/:id`
- ユーザー削除: `DELETE /api/users/:id`
- マスタ取得/更新: `GET/PUT /api/master`
- クリエイティブ一覧/詳細/更新/削除/シート参照/差し替え: `api/creatives/index.ts`
  - `GET /api/creatives`
  - `GET /api/creatives/:id`
  - `PUT /api/creatives/:id`
  - `DELETE /api/creatives/:id`
  - `GET /api/creatives/by-sheet`
  - `PUT /api/creatives/relink-sheet`

補足:
- 一覧表示およびCSV出力の `状態` 文言は統一し、UI表示ラベル（`下書き` / `完了` / `完了 -商品画像なし`）を使用する
- クリエイティブ工程の UI 表示ラベルは `クリエイティブ作成中` / `確認待ち` / `差し戻し` / `承認済み`
- 一般一覧/Admin一覧の CSV は表示用 `シートID` のみを出力する
- CSV列は画面運用に不要な項目を除外した構成にしている
- Vercel Hobby の Serverless Functions 上限対策として、Creative API の入口は catch-all 1本に集約している
- ただし責務は `一覧` `詳細` `シート参照` `差し替え` で分離しており、将来移管時は責務単位のAPI再分割を推奨する

## 6. 保存フロー

### 6.1 エントリーシート保存

1. UIで入力
2. `dataService.saveSheet` 実行
3. API側で認証・認可・入力検証
4. DBへ `entry_sheets` / `manufacturer_products` / `manufacturer_product_ingredients` / `product_entries` / `product_ingredients` / `attachments` を保存
5. 一覧を再取得し画面反映

補足:
- 過去商品検索は `manufacturer_products` を検索元とする
- `product_entries` はシート保存時点のスナップショットとして維持する
- フェイス数はマスタで `label + maxWidth` の組として管理し、シート保存時には選択した `faceLabel` / `faceMaxWidth` を `entry_sheets` に保存する
- 完了保存時の棚割り幅判定は `商品ごとの width × facingCount の合計 <= faceMaxWidth` を用いる
- 保存は 1 トランザクションで実施し、途中失敗時は全ロールバックする
- 本対応では、本番後に不要になる一時DB項目・移行専用テーブルは追加しない
- 保持ポリシー:
  - `entry_sheets` は `updated_at` から2年で削除
  - `manufacturer_products` は `last_used_at` から2年で削除
  - 関連テーブルは FK/CASCADE に従って削除

### 6.2 Adminメモ保存

1. Admin一覧または編集画面で Adminメモを更新
2. Admin一覧では `dataService.saveSheetAdminMemo` を実行（`PUT /api/sheets/:id` + `mode=admin_memo`）
3. 編集画面では `admin memo only` 判定を行う
4. Adminメモのみ変更時は `dataService.saveSheetAdminMemo`、通常項目またはワークフロー項目も同時に変更した場合は `dataService.saveSheet` を実行
5. `admin memo only` 判定では、通常シート項目に加えて `entryStatus` / `creativeStatus` / `currentAssignee` / `returnReason` も比較対象に含める
6. API側で ADMIN権限・入力検証・`adminMemo.version` 競合検知を実施
7. `entry_sheet_admin_memos` を更新し、通常項目も同時保存された場合のみ `entry_sheets` 側も更新
8. 成功時に更新済みシートを再取得し画面へ反映

補足:
- Adminメモのみ更新では `entry_sheets.updated_at` は更新しない
- 一覧の並び替え（`updated_at`）は通常シート更新のみ反映
- Adminメモ更新では `entry_sheet_revisions` を追加しない
- 変更履歴画面には Adminメモ差分を表示しない

### 6.3 クリエイティブ保存・紐づき変更

1. Adminが `クリエイティブ` ページで作成・更新する
2. 保存は `Creative API` で行い、既存の `saveSheet` には混ぜない
3. Creative本体と `creative_entry_sheets` の紐づき更新は同一処理で確定する
4. シート詳細から差し替える場合も、内部的には `Creative API` を呼ぶ
5. クリエイティブ保存時、紐づいたシートの `creativeStatus` は `in_progress` に更新する
6. シート詳細の進行管理ボタン（`クリエイティブ作成中にする` / `確認待ちにする` / `承認済みにする` / `差し戻しを確定`）は押下時点で即保存する
7. Adminが制作完了後、シート詳細で `確認待ち` に進める
8. 一般ユーザーは `確認待ち` のときのみ `承認済み` または `差し戻し` を実行する
9. 一般ユーザーが `差し戻し` 状態のシートを修正して `エントリー完了` を押した場合、`creativeStatus` は `none` に戻し、再びAdmin工程へ戻す
10. 未紐づきCreativeのみ削除可能とする
11. `2年以上未更新` かつ `未紐づき` のCreativeのみ自動削除対象とする

補足:
- 現行の Vercel Hobby 環境では関数数上限を避けるため、Creative API は `api/creatives/index.ts` に集約している
- ただし設計上の責務は分離しているため、AWS移管やProプラン移行など関数数制約が緩い環境では、`一覧` `詳細` `シート参照` `差し替え` を別APIに再分割した方が保守しやすい
- その場合も、Creativeの紐づき更新を `Creative API` 側の責務に一本化する方針は維持する

#### 6.3.1 ステータスの流れ

```text
下書き
  ├─ 一時保存 → 下書き
  └─ エントリー完了 → エントリー完了 / エントリー完了（画像なし）

エントリー完了 / エントリー完了（画像なし）
  ├─ Adminがクリエイティブ作成中にする → クリエイティブ作成中
  └─ Adminが差し戻し → 差し戻し

クリエイティブ作成中
  ├─ Adminが確認待ちにする → 確認待ち
  └─ Adminが差し戻し → 差し戻し

確認待ち
  ├─ 一般ユーザーが承認済みにする → 承認済み
  └─ 一般ユーザーが差し戻し → 差し戻し

差し戻し
  ├─ 一般ユーザーが修正してエントリー完了 → エントリー完了 / エントリー完了（画像なし）
  └─ Adminがクリエイティブ作成中に戻す → クリエイティブ作成中

承認済み
  ├─ Adminがクリエイティブ作成中に戻す → クリエイティブ作成中
  └─ Adminがクリエイティブを差し替える → クリエイティブ作成中
```

#### 6.3.2 UI表示と内部値の対応

| UI表示 | 内部値 |
|---|---|
| 下書き | `status=draft` `entryStatus=draft` `creativeStatus=none` |
| エントリー完了 | `status=completed` `entryStatus=completed` `creativeStatus=none` |
| エントリー完了（画像なし） | `status=completed_no_image` `entryStatus=completed_no_image` `creativeStatus=none` |
| クリエイティブ作成中 | `creativeStatus=in_progress` |
| 確認待ち | `creativeStatus=confirmation_pending` |
| 差し戻し | `creativeStatus=returned` |
| 承認済み | `creativeStatus=approved` |

#### 6.3.3 役割と実担当者の扱い

- `currentAssignee` は役割担当を表す
  - `admin`: Admin側
  - `manufacturer_user`: 一般ユーザー側
  - `none`: 未割り当て
- `assigneeUserId` は実担当者を表す
  - `users.id` を保持する
  - 画面表示は `assigneeUsername` を用いる
  - `assigneeUsername` は表示用文字列であり、担当者名を優先して返す
- 実担当者候補は役割に応じて絞る
  - `currentAssignee=admin`: Adminユーザーから選択
  - `currentAssignee=manufacturer_user`: 対象メーカー所属ユーザーから選択
  - `currentAssignee=none`: 実担当者は未設定
- 実担当者は手動で未割り当てにできる
- ユーザー削除時は `assigneeUserId` を `NULL` にし、未割り当てとして扱う
- 変更履歴では、役割変更に加えて実担当者変更も記録する

#### 6.3.4 ステータス遷移時の役割担当

| 状態 | 役割担当 (`currentAssignee`) | 説明 |
|---|---|---|
| 下書き | `manufacturer_user` | メーカー側が入力中 |
| エントリー完了 / エントリー完了（画像なし） | `admin` | メーカー側の提出完了後、Admin側へボールが渡る |
| クリエイティブ作成中 | `admin` | Adminがクリエイティブを作成中 |
| 確認待ち | `manufacturer_user` | Adminの制作完了後、一般ユーザー確認へ渡す |
| 差し戻し | 遷移元に応じて決定 | Adminからメーカーへ返す差し戻し、または一般からAdminへ返す差し戻しの両方がある |
| 承認済み | `none` | 完了状態 |

差し戻し時の役割担当:

- `エントリー完了 / エントリー完了（画像なし） -> 差し戻し`
  - `currentAssignee=manufacturer_user`
  - Adminがエントリー内容を確認し、メーカー側へ返す
- `クリエイティブ作成中 -> 差し戻し`
  - `currentAssignee=manufacturer_user`
  - Adminが制作工程からメーカー側へ返す
- `確認待ち -> 差し戻し`
  - `currentAssignee=admin`
  - 一般ユーザーが確認結果としてAdmin側へ返す

#### 6.3.5 ステータス遷移時の実担当者

- 役割担当が変わらない遷移では、実担当者を維持してよい
- 役割担当が変わる遷移では、実担当者が新しい役割に属さない場合は未割り当てにする
- `承認済み` 遷移時は、実担当者を未割り当てにする
- 未割り当て化された後は、ユーザーが手動で再設定する

### 6.4 画像/添付

- クライアントでもサイズ・解像度を先に検証
- APIでも同条件を再検証
- 画像/添付の実体は Blob に保存し、DBには URL を保存
- Creative画像は既存アップロード基盤を流用しつつ、`kind=creative` で保存分類を分ける

## 7. バリデーション（主要要件）

- 商品画像
  - 25MB以下
  - 短辺1000px未満はエラー
  - 2500px × 3508px程度を推奨表示
- 添付ファイル
  - 25MB以下
- JANコード
  - 全角数字入力を半角数字へ正規化して扱う
- 棚割り幅合計
  - `width × facingCount` の商品合計値
  - `completed` 保存時は、選択した `faceMaxWidth` を超えるとエラー

## 8. 非機能上の注意

- `@vercel/postgres` は将来的なSDK移行候補（Neon SDK）
- ログイン試行制限のカウンタは現状 `/tmp` ファイル利用
  - 無料サーバーレス環境では永続性が弱いため、将来 Redis 等への移行が望ましい
- 一覧ページングは初期30件 + 追加読み込み方式
  - 一般一覧/Admin一覧ともに、表示件数・全件数・残件数/残ページ（概算）を表示

## 9. 移行影響の早見表

| 移行対象 | 主な修正ファイル | 影響範囲 |
|---|---|---|
| Blob -> S3 | `api/_lib/media.ts`, `api/upload.ts` | 画像/添付アップロード・参照 |
| Neon -> AWS DB | `api/_lib/db.ts`, `api/_lib/repositories/*.ts` | 全APIの永続化 |
| Vercel Functions -> AWS実行基盤 | `api/*`, デプロイ設定 | API全体 |
| CDN/配信変更 | フロント配信設定、`VITE_API_BASE` | UIの接続先 |

## 10. 参照ドキュメント

- 権限設計: `docs/PERMISSIONS.md`
- セキュリティ設計: `docs/SECURITY.md`
- DB項目定義: `docs/DATABASE_SCHEMA.md`
- 構成全体: `docs/SYSTEM_OVERVIEW.md`
- 移行計画: `docs/AWS_S3_MIGRATION_PLAN.md`
