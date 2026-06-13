# エントリーシート登録・編集 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | エントリーシートの基本情報、商品情報、販促物情報、添付、Adminメモ、レビューを登録・編集する |
| 利用者 | `ADMIN`, `STAFF`, `RETAILER` |
| 到達条件 | `Page.EDIT` かつ `editingSheet` が存在すること |
| 実装根拠 | `src/App.tsx`, `src/components/EntryForm.tsx`, `src/lib/sheetWorkflow.ts`, `api/sheets/[id].ts`, `api/upload.ts`, `api/products/search.ts`, `api/sheets/[id]/review.ts` |

## 表示条件/権限

| 領域 | ADMIN | STAFF | RETAILER | ロジック |
| --- | --- | --- | --- | --- |
| シート基本情報 | 表示/編集 | 表示/編集 | 表示/編集 | 所有メーカーはAPI側で固定 |
| 商品情報 | 表示/編集 | 表示/編集 | 表示/編集 | `products` 配列を編集 |
| 販促物情報 | 表示/編集 | 表示/編集 | 表示/編集 | `promotions` 配列を編集 |
| Adminメモ | 表示/編集 | 非表示 | 非表示 | `currentUser.role === ADMIN` |
| 承認/修正依頼 | 表示 | 非表示 | 表示 | `ADMIN` または `RETAILER` かつ状態が完了系 |
| 展開終了月変更 | 可 | 不可 | 不可 | ADMINのみselect表示 |

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| 初期データ | `initialData` | 新規作成時は `App.handleCreateSheet` が初期値生成 |
| 変更履歴 | `GET /api/sheets/:id/revisions` | 既存シート編集時のみ取得 |
| 過去商品検索 | `GET /api/products/search` | メーカー境界内で商品名/JAN検索 |
| 添付/画像アップロード | `POST /api/upload` | data URLをBlobへ保存しURLを返す |
| 保存 | `PUT /api/sheets/:id` | シート全体またはAdminメモを保存 |
| レビュー | `PUT /api/sheets/:id/review` | `approve` または `request_revision` |
| コメント取得 | `GET /api/sheets/:id/comments` | レビュー可能ユーザーのみ直近コメント表示 |

## シート基本情報 フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 更新日 | 表示 | `updatedAt`。商品/タイトル/メール/電話変更で現在時刻に更新 | `toLocaleString('ja-JP')` | なし | 不正値は元値表示 | `EntrySheet.updatedAt` | 全員 | 編集操作で更新表示が変わること |
| 作成日 | 表示 | `createdAt` | `toLocaleString('ja-JP')` | なし | 不正値は元値表示 | `EntrySheet.createdAt` | 全員 | 新規作成時に現在時刻が入ること |
| メーカー名 | 表示 | 新規はログインユーザー所属、既存は保存済み値 | API保存時は既存/ログインユーザーで固定 | なし | 他メーカー保存はAPIが403 | `manufacturerName` | 全員 | 画面改ざんしてもAPIで所有メーカーに戻ること |
| 作成者 | text input | 新規は `currentUser.displayName` | API保存時 `trim()` | 一時保存/完了とも必須 | 空なら `作成者を入力してください` | `creatorName` | 全員 | 空で一時保存も完了も止まること |
| 作成者メール | email input | 新規は `currentUser.email` | API保存時 `trim()` | 必須 | 空ならalert。形式はUIでは厳密検証なし | `email` | 全員 | 空、長文、形式不正のAPI挙動を確認すること |
| 作成者電話番号 | tel input | 新規は `currentUser.phoneNumber` | API保存時 `trim()` | 必須 | 空ならalert。桁数はUIでは厳密検証なし | `phoneNumber` | 全員 | 空で保存不可。任意文字はAPI保存され得るため仕様差分を確認すること |
| カテゴリ名 | select | 新規はメーカー別カテゴリ名の先頭 | なし | 表示上必須 | UI保存時の必須alertなし。APIは空も受ける | `shelfName` | 全員 | 未選択でも保存できる現行挙動を確認すること |
| タイトル | text input | 展開スタート月/提出先/カテゴリ名から自動生成される場合あり | API保存時 `trim()` | 必須 | 空なら `タイトルを入力してください` | `title` | 全員 | 空、自動生成、手修正後の自動上書き抑止を確認すること |
| 提出先 | select | 新規は小売店名の先頭 | なし | 表示上必須 | UI保存時の必須alertなし | `caseName` | 全員 | 提出先/カテゴリ名変更で自動タイトルが更新されること |
| 展開スタート月 | ボタン群 | 作成月から4カ月分。メーカー別デフォルト月が一致すれば自動選択 | 月数number | 任意 | 1-12以外はAPIで無効化 | `deploymentStartMonth` | 全員 | デフォルト月、手動選択、年跨ぎを確認すること |
| 展開期間終了 | 表示/select | スタート月の2カ月後相当 `((start+1)%12)+1` | ADMINはselectで数値化 | 任意 | 1-12以外はAPIで無効化 | `deploymentEndMonth` | ADMINのみ編集可 | STAFF/RETAILERでは自動表示のみで変更不可 |
| エントリシート補足情報 | textarea | 空 | API保存時 `trim()` | 任意 | APIで4000文字以内 | `notes` | 全員 | 4000文字超過時のAPIエラーを確認すること |
| シート添付ファイル | file input/list | 空配列 | ファイルをdata URL化し `/api/upload` | 任意 | 25MB以下。APIでURL形式検証 | `attachments[]` | 全員 | 複数追加、削除、DL、不正URLを確認すること |
| 棚割り幅 | select/表示 | メーカー別フェイス設定。1件のみなら自動選択 | 選択値から `faceLabel`, `faceMaxWidth` をセット | 完了時のみ条件付き必須 | フェイス設定があり未選択で完了するとalert | `faceLabel`, `faceMaxWidth` | 全員 | マスタ0件/1件/複数件で表示と完了可否を確認すること |
| 棚割り幅合計 | 表示 | 商品ごとの `width * facingCount` 合計 | number集計 | なし | フェイスMAX超過で赤表示。完了保存は不可 | なし | 全員 | 超過時に完了できず、一時保存は可能なこと |

## 商品情報 フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 商品タブ | タブ | 1商品以上。新規は1件作成 | なし | 1件以上 | 1件だけの削除はalert | `products[]` | 全員 | 追加、切替、最後の1件削除不可を確認すること |
| 過去商品検索 | text input/button | 空 | 検索文字列をAPIへ送信 | 任意 | API側でメーカー必須 | なし | 全員 | 検索失敗alert、結果反映を確認すること |
| JANコード | text input | 空 | 全角を半角化し数字以外除去、最大16桁 | 完了時必須 | 完了時は8/13/16桁かつ数字のみ。APIは重複JANを検出 | `products[].janCode` | 全員 | 全角/記号除去、桁数、JAN競合確認ダイアログを確認すること |
| 商品名 | text input | 空 | なし。API保存時 `trim()` | 完了時必須 | 空なら完了不可。blur時に同名過去データ反映確認 | `products[].productName` | 全員 | 同名候補あり/なし、反映キャンセル、空完了不可を確認すること |
| 商品画像 | 画像アップロード | 空 | ブラウザで短辺取得後 `/api/upload` | 表示上必須 | 25MB以下、短辺1000px以上、画像形式判定。未登録でも完了時は `completed_no_image` | `products[].productImage` | 全員 | 画像なし完了、低解像度、25MB超、未対応形式を確認すること |
| 幅(mm) | number input | 0 | `Number(value.normalize('NFKC'))`、不正は0 | 表示上必須 | UIは0以下をハイライト。完了保存では必須扱いしない | `products[].width` | 全員 | 全角数字、空、不正値、棚幅合計への反映を確認すること |
| 高さ(mm) | number input | 0 | 同上 | 表示上必須 | UIは0以下をハイライト。完了保存では必須扱いしない | `products[].height` | 全員 | タブ状態が入力中/完了に変わること |
| 奥行(mm) | number input | 0 | 同上 | 表示上必須 | UIは0以下をハイライト。完了保存では必須扱いしない | `products[].depth` | 全員 | 空入力時に0扱いになること |
| フェイシング数 | number input | 1 | 同上 | 表示上必須 | UIは0以下をハイライト。完了保存では必須扱いしない | `products[].facingCount` | 全員 | 棚割り幅合計に乗算反映されること |
| リスク分類 | select | マスタ先頭 | なし | 表示上必須 | UIは空をハイライト。完了保存では必須扱いしない | `products[].riskClassification` | 全員 | マスタ空時と選択変更を確認すること |
| 特定成分 | checkbox group | 空配列 | チェックで追加/削除 | 任意 | なし | `products[].specificIngredients[]` | 全員 | 複数選択、解除、保存後復元を確認すること |
| 納品日 | date input | 空 | `YYYY-MM-DD` | 任意 | なし | `products[].arrivalDate` | 全員 | CSV/一覧カードに反映されること |
| キャッチコピー | textarea | 空 | なし。API保存時長さ確認 | 任意 | APIで4000文字以内 | `products[].catchCopy` | 全員 | 長文超過時のAPIエラーを確認すること |
| 補足事項 | textarea | 空 | なし。API保存時長さ確認 | 任意 | APIで4000文字以内 | `products[].productNotes` | 全員 | URLなど任意文字列が保存されること |
| 商品添付ファイル | file input/list | 空配列 | data URL化し `/api/upload` | 任意 | 25MB以下 | `products[].productAttachments[]` | 全員 | 複数追加、削除、DL、保存後復元を確認すること |

## 販促物情報 フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 販促物タブ | タブ | 0件可。追加時 `hasPromoMaterial: 'yes'` | なし | 任意 | 削除時confirm | `promotions[]` | 全員 | 0件表示、追加、削除、タブ状態を確認すること |
| サンプル仕様 | text input | 空 | なし | 任意 | API側の明示検証なし | `promotions[].promoSample` | 全員 | 入力後タブが入力中になること |
| 特別什器等 | text input | 空 | なし | 任意 | API側の明示検証なし | `promotions[].specialFixture` | 全員 | 保存後復元されること |
| 販促物 幅(mm) | number input | 空 | 入力ありなら `Number(value)`、空なら `undefined` | 任意 | 数値以外はブラウザinput依存 | `promotions[].promoWidth` | 全員 | 空/数値で保存値が変わること |
| 販促物 高さ(mm) | number input | 空 | 同上 | 任意 | 同上 | `promotions[].promoHeight` | 全員 | タブ完了判定に反映されること |
| 販促物 奥行(mm) | number input | 空 | 同上 | 任意 | 同上 | `promotions[].promoDepth` | 全員 | 3サイズ揃いかつ画像ありで完了表示になること |
| 販促物画像 | file upload | 空 | `/api/upload` kind `promo` | 任意 | 25MB以下。acceptは `image/*,.ai,.eps` | `promotions[].promoImage` | 全員 | AI/EPS選択、25MB超、アップロード失敗alertを確認すること |

## Adminメモ フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 販促CD | text input | 空 | 全角半角正規化、大文字化 | 任意 | APIで `X000000` 形式 | `adminMemo.promoCode` | ADMINのみ | 小文字/全角入力、形式不正エラーを確認すること |
| ボードピッキングJAN | text input | 空 | 数字以外除去、13桁まで | 任意 | APIで13桁数字 | `adminMemo.boardPickingJan` | ADMINのみ | 14桁以上切り詰め、13桁未満エラーを確認すること |
| 期限表URL | url input | 空 | なし。API保存時 `trim()` | 任意 | APIで `http://` または `https://` | `adminMemo.deadlineTableUrl` | ADMINのみ | http/https以外がAPIで拒否されること |
| 帯パターン | numeric text | 空 | 数字以外除去 | 任意 | APIで非負整数相当、4000文字以内 | `adminMemo.bandPattern` | ADMINのみ | 全角/記号除去、空はundefinedになること |
| 対象店舗数 | numeric text | 空 | 全角半角正規化、数値化、整数化 | 任意 | 負数/不正はundefined | `adminMemo.targetStoreCount` | ADMINのみ | 空、0、正数、不正値を確認すること |
| 印刷依頼数量 ボード1/2 | numeric text | 空 | 数値化、整数化 | 任意 | 同上 | `printBoard1Count`, `printBoard2Count` | ADMINのみ | 保存後Admin一覧にも反映されること |
| 印刷依頼数量 帯1/2 | numeric text | 空 | 数値化、整数化 | 任意 | 同上 | `printBand1Count`, `printBand2Count` | ADMINのみ | 保存後Admin一覧にも反映されること |
| 印刷依頼数量 その他 | textarea | 空 | API保存時 `trim()` | 任意 | APIで4000文字以内 | `adminMemo.printOther` | ADMINのみ | 長文超過時のAPIエラーを確認すること |
| 備品 | textarea | 空 | API保存時 `trim()` | 任意 | APIで4000文字以内 | `adminMemo.equipmentNote` | ADMINのみ | 保存後復元されること |
| 備考 | textarea | 空 | API保存時 `trim()` | 任意 | APIで4000文字以内 | `adminMemo.adminNote` | ADMINのみ | Admin一覧の備考と整合すること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| 一時保存 | `saveSheet('draft')` | 必須ヘッダのみ満たせば商品JAN未入力でも保存できること |
| エントリー完了 | `saveSheet('completed')` | 商品名/JAN、JAN桁数、棚割り幅、フェイスMAX超過、画像なしステータスを確認すること |
| 保存 | 下書き以外では現在ステータスで保存 | 承認/修正依頼後の編集保存の状態維持を確認すること |
| 競合上書き | APIが `VERSION_CONFLICT` の場合confirm | キャンセルで保存されず、OKでforce保存されること |
| JAN競合上書き | APIが `JAN_CONFLICT` の場合confirm | キャンセル/OKの分岐を確認すること |
| レビュー承認 | `approve` を送信 | 完了系ステータスでのみボタン表示。成功後一覧に戻ること |
| 修正依頼 | `request_revision` を送信 | コメント必須。空ならalert。成功後一覧に戻ること |
| キャンセル | `onCancel` | 編集内容を破棄して一覧へ戻ること |

## API/保存時制約

| 制約 | 内容 |
| --- | --- |
| 所有者 | 新規は現在ユーザー、既存は既存レコードの `manufacturerName` と `creatorId` をAPIで保持 |
| 商品メーカー | `products[].manufacturerName` はAPIでシート所有メーカーに上書き |
| 商品数 | 0件はAPIで `At least one product is required` |
| 文字数 | 多くの自由入力はAPIで4000文字以内 |
| Adminメモ | ADMIN以外は既存値維持。Adminメモのみ変更なら専用更新 |
| メディア | data URLは保存前にBlob URLへ正規化。不正メディアは400 |
| 履歴 | 保存時に変更履歴を最大30件保持 |
| 削除済みBlob | 保存失敗/保存後に未使用Blobを削除対象にする |

## エラー/例外

| ケース | 画面表示/挙動 |
| --- | --- |
| アップロード中保存 | `ファイルアップロード中です。完了後に保存してください。` |
| ヘッダ必須不足 | 作成者/メール/電話/タイトルごとのalert |
| 商品必須不足 | `商品Nの必須項目が不足しています: ...` |
| JAN桁数不正 | `JANコードは8桁 / 13桁 / 16桁...` |
| JAN数字以外 | 入力時に除去されるが、保存時にも数字チェック |
| 商品画像低解像度 | `解像度不足です（短辺1000px未満）。` |
| 画像容量超過 | 25MB超はalert。413は長文の代替案内 |
| レビュー送信失敗 | `レビューの送信に失敗しました。` |

## 保守テスト観点

- UIでは必須表示だが完了保存で必須扱いしていない項目（カテゴリ名、案件、寸法、リスク分類）があるため、現行仕様として確認すること。
- 商品画像なしの完了は保存を止めず `completed_no_image` になること。
- `faceMaxWidth` 超過は完了保存のみ止まり、一時保存は可能であること。
- Adminメモだけを編集した場合、シート全体保存ではなくAdminメモ専用保存になること。
- API側で所有メーカー、商品メーカー、展開終了月の編集権限が強制されること。
