# エントリー履歴（Admin） 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | ADMINが全エントリーシートを一覧し、Adminメモを行内編集、一括保存、CSV出力、削除する |
| 利用者 | `ADMIN` |
| 到達条件 | ログイン後、`Page.ADMIN_LIST`。ADMIN以外は到達不可 |
| 実装根拠 | `src/App.tsx`, `src/components/AdminEntryList.tsx`, `api/sheets/[id].ts`, `src/lib/sheetWorkflow.ts` |

## 表示条件/権限

| ロール | 表示 | 操作 |
| --- | --- | --- |
| ADMIN | 可 | Adminメモ保存、CSV、詳細編集、削除 |
| STAFF | 不可 | 不可 |
| RETAILER | 不可 | 不可 |

`App.handleNavigate` でも `Page.ADMIN_LIST` はADMIN以外を `Page.LIST` へ戻す。

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| 初期表示 | `dataService.getSheetsPage(0, 30)` | ADMINの一覧データを使用 |
| 追加読込 | `dataService.getSheetsPage(offset, 30)` | `hasMore` がtrueの場合に追加取得 |
| Adminメモ保存 | `PUT /api/sheets/:id` with `mode: 'admin_memo'` | 行単位または一括でAdminメモのみ保存 |
| 詳細編集 | `onEdit(sheet)` | `EntryForm` へ遷移 |
| 削除 | `DELETE /api/sheets/:id` | 削除後一覧から除外 |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 検索キーワード | text input | 空 | `trim().toLowerCase()` | 任意 | なし | `keyword` state | ADMIN | タイトル、メーカー名、カテゴリ名で検索できること |
| メーカーフィルタ | select | 空（全メーカー） | なし | 任意 | 一覧内メーカー名から候補生成 | `manufacturerFilter` | ADMIN | メーカー選択で絞り込みされること |
| 展開期間条件 | select | `since` | enum変換 | 任意 | `since`/`until` | `deploymentFilterMode` | ADMIN | 以降/以前で期間比較が変わること |
| 展開期間日付 | date input | 空 | 日始/日末タイムスタンプへ変換 | 任意 | 空ならフィルタなし | `deploymentDate` | ADMIN | 解除で空になること |
| 選択チェック | チェックボタン | 未選択 | Setに追加/削除 | 任意 | 表示中全選択/全解除 | `selectedSheets` | ADMIN | CSV対象の選択件数が一致すること |
| シートID | 表示 + 詳細編集ボタン | `sheetCode` 優先、なければ短縮ID | なし | なし | なし | なし | ADMIN | ID横の編集ボタンで詳細画面へ遷移すること |
| 状態 | 表示 | `getWorkflowStatusView(sheet)` | なし | なし | なし | なし | ADMIN | 下書き/完了/画像なし/修正依頼/承認が正しく表示されること |
| タイトル | 表示 | `sheet.title` | なし | なし | なし | なし | ADMIN | 長いタイトルが折り返し/省略表示されること |
| 展開期間 | 表示 | 作成日と展開月から算出 | 年跨ぎ計算 | なし | 未設定は `未設定` | なし | ADMIN | 年跨ぎ、未設定を確認すること |
| カテゴリ名 | 表示 | `sheet.shelfName` | `trim()` | なし | 空なら `未設定` | なし | ADMIN | 空白値が未設定表示になること |
| メーカー名 | 表示 | `sheet.manufacturerName` | なし | なし | なし | なし | ADMIN | フィルタ候補と一致すること |
| 期限表 | リンク/無効アイコン | AdminメモURL | `isHttpUrl` で判定 | 任意 | `http://` または `https://` のときリンク化 | `adminMemo.deadlineTableUrl` | ADMIN | URL有無、無効URL、別タブ表示を確認すること |
| 販促CD | text input | `adminMemo.promoCode` | 全角半角正規化、大文字化 | 任意 | APIで `X000000` 形式 | `adminMemo.promoCode` | ADMIN | 小文字/全角入力、形式エラーを確認すること |
| ボードピッキングJAN | numeric text | `adminMemo.boardPickingJan` | 全角半角正規化、数字以外除去 | 任意 | APIで13桁数字 | `adminMemo.boardPickingJan` | ADMIN | 文字混在時に数字だけ残ること |
| 帯パターン | numeric text | `adminMemo.bandPattern` | 数字以外除去 | 任意 | APIで非負整数相当 | `adminMemo.bandPattern` | ADMIN | 単位「種」と保存値を確認すること |
| 対象店舗数 | numeric text | `adminMemo.targetStoreCount` | 数字以外除去、保存時整数化 | 任意 | APIで非負整数相当 | `adminMemo.targetStoreCount` | ADMIN | 0、空、正数を確認すること |
| 印刷依頼数量 ボード1/2 | numeric text | `adminMemo.printBoard1Count/2Count` | 数字以外除去、保存時整数化 | 任意 | APIで非負整数相当 | `printBoard1Count`, `printBoard2Count` | ADMIN | モバイル/PCで同じ保存結果になること |
| 印刷依頼数量 帯1/2 | numeric text | `adminMemo.printBand1Count/2Count` | 数字以外除去、保存時整数化 | 任意 | APIで非負整数相当 | `printBand1Count`, `printBand2Count` | ADMIN | 一括保存対象になること |
| 備考 | モバイルは非表示、CSVには含む | `adminMemo.adminNote` | 保存時 `trim()` | 任意 | APIで4000文字以内 | `adminMemo.adminNote` | ADMIN | EntryForm側のAdminメモとCSV出力の整合を確認すること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| 行内編集 | `drafts[sheet.id]` を更新 | 編集行がdirty表示になること |
| 行保存 | dirtyなら `onSaveAdminMemo(sheetId, memo)` | 保存後dirtyが消え、versionが更新されること |
| 一括保存 | `dirtySheetIds` を `Promise.all` で保存 | 複数行保存、保存中表示、部分失敗時の挙動を確認すること |
| 未保存離脱警告 | `beforeunload` で警告 | dirtyありでブラウザ更新時に警告されること |
| CSV出力 | 表示中または選択中をAdmin CSVとして出力 | BOM、CSVインジェクション対策、Adminメモ列を確認すること |
| 期限表を開く | URLがhttp/httpsならリンク表示 | 無効URLではアイコン無効表示になること |
| 詳細編集 | `onEdit(sheet)` | Adminメモの未保存変更がある状態で遷移した場合の扱いを確認すること |
| 削除 | 確認モーダル後に `onDelete(id)` | キャンセル/削除中/選択解除を確認すること |
| さらに読込 | `onLoadMore` | 表示件数と残件数が更新されること |

## CSV出力項目

1シート1行で出力する。主な列は、シートID、状態、タイトル、シート補足、メーカー名、作成者、作成日、更新日、展開期間開始/終了、シート添付、展開期間、カテゴリ名、販促CD、ボードピッキングJAN、期限表URL、帯パターン、対象店舗数、印刷依頼数量、印刷依頼数量その他、備品、備考。

画面で未保存のdraft値がある場合、CSVの一部列（販促CD、JAN、帯パターン、対象店舗数、印刷数量、備考）はdraft値を使う。`printOther` と `equipmentNote` は保存済み `memo` 値を使う。

## API/保存時制約

| 制約 | 内容 |
| --- | --- |
| Adminメモ更新 | `mode: 'admin_memo'` はADMINのみ |
| version | `adminMemo.version` を期待バージョンとして競合制御 |
| 販促CD | `X` + 数字6桁 |
| ボードピッキングJAN | 13桁数字 |
| 期限表URL | `http://` または `https://` |
| 文字数 | URL、帯パターン、印刷その他、備品、備考は4000文字以内 |
| 競合 | `VERSION_CONFLICT` 時は `App.handleSaveSheetAdminMemo` が上書きconfirm |

## エラー/例外

| ケース | 画面表示/挙動 |
| --- | --- |
| CSV対象なし | `CSV出力対象がありません。` |
| Adminメモ保存失敗 | `App.handleSaveSheetAdminMemo` がalert |
| version競合 | `他のユーザーが先にAdminメモを更新しました。上書き保存しますか？` |
| 期限表URL不正 | APIエラー。画面入力時点ではリンク無効化のみ |
| 削除失敗 | App層がalert、Admin一覧側はcatchのみ |

## 保守テスト観点

- dirty判定は `buildDraftFromSheet(sheet)` との差分で行うため、保存済み値とdraft値の同期を確認すること。
- 行保存と一括保存で同じpayloadが送られること。
- beforeunload警告がdirtyなしでは出ないこと。
- Admin CSVが通常一覧CSVと列粒度が異なること。
- モバイルカード表示とデスクトップテーブル表示で保存対象フィールドが一致すること。
