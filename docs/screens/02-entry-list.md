# エントリーシート履歴 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | エントリーシートの検索、確認、編集、複製、削除、CSV出力、商品画像一括ダウンロードを行う |
| 利用者 | `ADMIN`, `STAFF`, `RETAILER` |
| 到達条件 | ログイン後、`Page.LIST` |
| 実装根拠 | `src/App.tsx`, `src/components/EntryList.tsx`, `src/lib/sheetWorkflow.ts`, `src/services/dataService.ts`, `api/sheets.ts`, `api/sheets/[id].ts` |

## 表示条件/権限

| ロール | 表示対象 | 編集/複製/削除 |
| --- | --- | --- |
| ADMIN | APIが返した全シート | すべて可 |
| STAFF | `sheet.manufacturerName` が自分の所属メーカーと一致するシート | 自社メーカーのみ可 |
| RETAILER | API側で小売店向けに絞られたシート | `canModifySheet` 上は所属名一致時のみ可 |

`App` は `ADMIN` と `RETAILER` ではAPI結果をそのまま表示し、`STAFF` では画面側でもメーカー名一致でフィルタする。

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| 初期表示 | `dataService.getSheetsPage(0, 30)` | 30件単位でシート一覧を取得 |
| 追加読込 | `dataService.getSheetsPage(sheetOffset, 30)` | `hasMore` がtrueの場合に追加取得 |
| 編集遷移 | `onEdit(sheet, productIndex?)` | `Page.EDIT` に遷移し、編集対象をセット |
| 複製 | `dataService.saveSheet(duplicated)` | ID/商品IDを再採番し、タイトルに `(コピー)` を付けて下書き保存 |
| 削除 | `DELETE /api/sheets/:id` | 削除後一覧から除外し、先頭ページを再読込 |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 検索キーワード | text input | 空 | `trim().toLowerCase()` | 任意 | なし | 画面state `searchTerm` | 全員 | タイトル、メーカー名、商品名で部分一致すること |
| 絞り込み対象 | select | `updatedAt` | enum変換 | 任意 | `createdAt`/`updatedAt`/`deploymentPeriod` のみ | `dateFilterBy` | 全員 | 作成日/更新日/展開期間で対象日が変わること |
| 絞り込み条件 | select | `since` | enum変換 | 任意 | `since`/`until` のみ | `dateFilterMode` | 全員 | 以降/以前で比較方向が変わること |
| 絞り込み日付 | date input | 空 | `YYYY-MM-DDT00:00:00` と `T23:59:59.999` に変換 | 任意 | 空ならフィルタなし | `dateSince` | 全員 | 解除ボタンで空に戻ること |
| 並び順 | テーブルヘッダボタン | `updatedAt desc` | なし | 任意 | `updatedAt` または `manufacturer` | `sortBy`, `sortOrder` | デスクトップ表示 | 同じ列クリックで昇順/降順が切り替わること |
| 選択チェック | チェックボタン | 未選択 | Setに追加/削除 | 任意 | なし | `selectedSheets` | 全員 | 個別/全選択/全解除が動くこと |
| シートID | 表示 | `sheetCode` 優先、なければ `id.slice(0, 8)` | なし | なし | なし | なし | 全員 | 旧データでも短縮IDが表示されること |
| 状態 | 表示 | `getWorkflowStatusView(sheet)` | なし | なし | `draft`, `completed`, `completed_no_image`, `revision_requested`, `approved` | なし | 全員 | 表示ラベルと色が状態に一致すること |
| 展開期間 | 表示 | `createdAt` と `deploymentStartMonth` から算出 | 月跨ぎを年に反映 | なし | start未設定/不正日は `未設定` | なし | 全員 | 年跨ぎ、未設定、不正日付を確認すること |
| カテゴリ名 | 表示 | `sheet.shelfName` | `trim()` | なし | 空なら `未設定` | なし | 全員 | 空白だけのカテゴリ名が未設定表示になること |
| 商品カード | 展開内カード | 商品配列 | なし | なし | 商品名/JAN不足は赤、画像なしは黄 | なし | 全員 | 商品クリックで該当商品タブを開くこと |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| 新規作成 | `App.handleCreateSheet` が初期シートを作成し `Page.EDIT` へ | 初期値がログインユーザー/マスタから入ること |
| 編集 | `canModifySheet` がtrueなら `onEdit(sheet)` | STAFFが他社シートを編集できないこと |
| 商品別編集 | 商品カード押下で `onEdit(sheet, idx)` | 指定商品タブがアクティブになること |
| 複製 | シート/商品IDを再採番、`status` と `entryStatus` は `draft` | 複製後に一覧へ追加されること |
| 削除 | 削除確認モーダルを表示し、確定で `onDelete(id)` | キャンセル、削除中表示、削除後選択解除を確認すること |
| CSV出力 | モーダルで「表示中」または「選択のみ」を選びCSV生成 | BOM付きUTF-8、CSVインジェクション対策、商品単位行を確認すること |
| 商品画像一括DL | 選択シートの商品画像をZIP化 | 未選択、画像なし、一部取得失敗、成功時ファイル名を確認すること |
| さらに読込 | `hasMore` の場合 `onLoadMore` | 30件ずつ増え、重複追加されないこと |

## CSV出力項目

1商品1行で出力する。主な列は、シートID、状態、タイトル、補足、メーカー、作成者、作成日、更新日、展開期間開始/終了、シート添付、カテゴリ名、販促物件数、商品メーカー名、JAN、商品名、商品画像URL、リスク分類、特定成分、キャッチコピー、商品添付、サイズ、フェイシング数、納品日。

セル値は `=`, `+`, `-`, `@` で始まる場合に先頭へ `'` を付け、ダブルクォートをエスケープする。

## エラー/例外

| ケース | 画面表示/挙動 |
| --- | --- |
| CSV対象なし | CSVモーダル内で選択肢が実質無効。Admin画面と異なり通常一覧は空配列でもCSV生成可能 |
| 画像DL未選択 | `画像をダウンロードするには、対象のエントリーシートを選択してください。` |
| 画像なし | `選択したエントリーシートに商品画像がありません。` |
| 一部画像取得失敗 | 成功分のみZIP化し、成功/失敗件数をalert |
| 画像DL全失敗 | `画像の一括ダウンロードに失敗しました。` |
| 削除失敗 | `App.handleDeleteSheet` がAPIエラーまたは汎用文言をalert |

## 保守テスト観点

- モバイルカード表示とデスクトップテーブル表示で同じ操作ができること。
- `selectedSheets` は検索/フィルタ変更後も保持されるため、CSV対象が意図通りか確認すること。
- STAFFで他社シートが一覧から除外され、仮に表示されても編集/複製/削除が無効になること。
- `deploymentPeriod` フィルタは期間重複判定、作成日/更新日は単日比較であること。
- 画像ZIPはdata URLとhttp/https URLのみ対応し、不正URLは失敗扱いになること。
