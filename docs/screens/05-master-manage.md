# マスタ管理 画面設計書

## 画面概要

| 項目 | 内容 |
| --- | --- |
| 目的 | エントリーシート入力で使用するメーカー、小売店、カテゴリ名、フェイス設定、デフォルト展開月、リスク分類、特定成分を管理する |
| 利用者 | `ADMIN` |
| 到達条件 | ログイン後、`Page.MASTERS`。ADMIN以外は到達不可 |
| 実装根拠 | `src/App.tsx`, `src/components/MasterManage.tsx`, `api/master.ts`, `api/_lib/repositories/masters.ts` |

## 表示条件/権限

| ロール | 表示 | 保存 |
| --- | --- | --- |
| ADMIN | 可 | 可 |
| STAFF | 不可 | 不可。APIのGETでは入力用マスタのみ取得可 |
| RETAILER | 不可 | 不可。APIのGETでは入力用マスタのみ取得可 |

`PUT /api/master` はADMINのみ許可する。非ADMINは403 `Only admin can update master data`。

## データ取得/保存

| 処理 | API/関数 | 内容 |
| --- | --- | --- |
| 初期表示 | `GET /api/master` | ADMINには全マスタとメーカー別設定マップを返す |
| 保存 | `PUT /api/master` | `MasterData` 全体または該当マップを更新 |
| ローカル反映 | `persist(newData, section)` | 先に画面stateへ反映し、保存中セクションを表示 |

## フィールドロジック

| 項目名 | UI種別 | 初期値・自動入力 | 入力変換 | 必須条件 | バリデーション | 保存先 | 権限・表示条件 | テスト観点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| メーカー名 | タグ一覧 + text input | API取得値 | `trim()` | 追加時は空不可 | 重複は追加しない。APIで20文字以内 | `manufacturerNames[]` | ADMIN | 空、重複、20文字超、削除confirmを確認すること |
| 小売店名 | タグ一覧 + text input | API取得値 | `trim()` | 追加時は空不可 | 重複は追加しない。APIで20文字以内 | `retailerNames[]` | ADMIN | アカウント管理のRETAILER所属候補へ反映されること |
| メーカー別設定対象 | select | メーカー名先頭。メーカー一覧変更時に存在しない選択は先頭へ補正 | なし | 編集時はメーカー選択必須 | `__all__` は一覧閲覧用 | `selectedManufacturer` state | ADMIN | メーカー削除後に選択状態が補正されること |
| カテゴリ名（メーカー別） | タグ一覧 + text input | 選択メーカーの `manufacturerShelfNames` | `trim()` | 追加時は空不可 | 同一メーカー内重複は追加しない。APIで20文字以内 | `manufacturerShelfNames[manufacturer][]` | ADMIN、`すべて` 以外で編集 | EntryFormのカテゴリ名selectに反映されること |
| カテゴリ名（すべて表示） | 読み取りリスト | 全メーカーのカテゴリ名 | なし | なし | 削除時はメーカー/カテゴリ名指定でconfirm | 同上 | ADMIN、`すべて` 選択時 | すべて表示から削除できること |
| フェイス設定 ラベル | text input | 空 | `trim()` | 追加時必須 | 同一メーカー内ラベル重複不可。APIで20文字以内 | `manufacturerFaceOptions[manufacturer][].label` | ADMIN、`すべて` 以外で編集 | EntryFormの棚割り幅選択肢に反映されること |
| フェイス設定 MAX値 | number input | 空 | `Number(faceMaxWidthInput)` | 追加時必須 | 正の整数のみ。APIでも正整数必須 | `manufacturerFaceOptions[manufacturer][].maxWidth` | ADMIN、`すべて` 以外で編集 | 0、負数、小数、文字を確認すること |
| フェイス設定（すべて表示） | 読み取りリスト | 全メーカーのフェイス設定 | なし | なし | 削除時confirm | 同上 | ADMIN、`すべて` 選択時 | すべて表示から削除できること |
| デフォルト展開スタート月 | 月ボタン | 選択メーカーの月配列 | 月番号1-12 | 任意 | APIで1-12の整数のみ | `manufacturerDefaultStartMonths[manufacturer][]` | ADMIN、`すべて` 以外で編集 | EntryForm新規作成時の自動選択に反映されること |
| リスク分類 | タグ一覧 + text input | API取得値 | `trim()` | 追加時は空不可 | 重複は追加しない。APIで20文字以内 | `riskClassifications[]` | ADMIN | EntryFormの商品リスク分類selectに反映されること |
| 特定成分 | タグ一覧 + text input | API取得値 | `trim()` | 追加時は空不可 | 重複は追加しない。APIで20文字以内 | `specificIngredients[]` | ADMIN | EntryFormのチェックボックス群に反映されること |

## 操作ロジック

| 操作 | ロジック | テスト観点 |
| --- | --- | --- |
| 追加 | 入力値をtrimし、空/重複なら何もしない | 空と重複ではAPI保存が走らないこと |
| 削除 | `window.confirm` 後に対象値を配列から除外して保存 | キャンセル時は変更されないこと |
| メーカー切替 | `selectedManufacturer` を変更 | メーカー別カテゴリ/フェイス/月が切り替わること |
| すべて表示 | `ALL_MANUFACTURERS` 選択 | カテゴリ/フェイスは全件閲覧、デフォルト月は閲覧専用文言になること |
| 月トグル | 配列に追加/削除し昇順ソート | 複数月選択と解除を確認すること |

## API/保存時制約

| 制約 | 内容 |
| --- | --- |
| マスタ値文字数 | 20文字以内 |
| フェイスMAX値 | 正の整数 |
| デフォルト月 | 1から12の整数 |
| メーカー別マップ | `manufacturerNames` に存在するメーカーだけを正規化して保存 |
| 非ADMIN GET | `manufacturerNames: []` とし、現在ユーザー向けカテゴリ/フェイス等だけ返す |
| 非ADMIN PUT | 403 |

## エラー/例外

| ケース | 画面表示/挙動 |
| --- | --- |
| 空追加 | 何もしない |
| 重複追加 | 何もしない |
| 保存失敗 | `MasterManage` 内ではfinallyで保存中解除。`App.handleSaveMaster` がconsole error |
| API文字数超過 | APIが400を返す。画面上の個別alertはなし |
| 削除キャンセル | 変更なし |

## 保守テスト観点

- マスタ変更が入力画面の候補に反映されること。
- 20文字超過はAPIで止まり、保存済みデータが壊れないこと。
- メーカー削除時にメーカー別カテゴリ/フェイス/月の扱いがAPI正規化と一致すること。
- `すべて` 選択時にカテゴリ/フェイスは削除でき、月は編集できないこと。
- 保存中のボタンdisabledがセクション単位で効くこと。
