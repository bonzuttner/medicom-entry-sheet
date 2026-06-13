# Entry Sheet Detail Screen — Field Specification

## Overview

The Entry Sheet detail screen allows manufacturers (メーカー) to submit product entry requests to a retailer (小売店). Each sheet goes through a workflow of draft → completed → review → approved.

---

## Status Definitions

| ステータス value | Meaning |
|---|---|
| `draft` | 下書き — saved as a draft, not yet submitted |
| `completed` | 完了 — submitted (with product images) |
| `completed_no_image` | 画像なし完了 — submitted without product images |
| `revision_requested` | 修正依頼 — admin has requested corrections |
| `approved` | 承認済み — approved by admin |

---

## User Roles

| Role | Description |
|---|---|
| `ADMIN` | Administrator — can approve, request revisions, edit all fields |
| `STAFF` | Manufacturer staff — creates and submits sheets |
| `RETAILER` | Retailer — read-only access |

---

## Screen Structure

The screen is divided into the following sections:

1. 作成情報 (Creation Info)
2. 詳細情報 (Detail Info)
3. 変更履歴 (Change History)
4. 商品情報 (Product Info) — repeatable tabs
5. 販促物情報 (Promotion Material Info) — repeatable tabs
6. 管理者メモ (Admin Memo) — admin only

---

## Section 1: 作成情報 (Creation Info)

| Field Label (UI) | Field Name | Data Type | Input Method | Required (下書き) | Required (完了時) | Validation Rule | Error Message |
|---|---|---|---|---|---|---|---|
| 作成日時 | `createdAt` | string (ISO date) | Auto-filled, read-only | — | — | — | — |
| 更新日時 | `updatedAt` | string (ISO date) | Auto-filled, read-only | — | — | — | — |
| メーカー名 | `manufacturerName` | string | Auto-filled, read-only | — | — | — | — |
| 作成者 | `creatorName` | string | Text input | ○ | ○ | Required | 作成者を入力してください |
| 作成者メール | `email` | string | Text input | ○ | ○ | Required | 作成者メールを入力してください |
| 作成者電話番号 | `phoneNumber` | string | Text input | ○ | ○ | Required | 作成者電話番号を入力してください |

---

## Section 2: 詳細情報 (Detail Info)

| Field Label (UI) | Field Name | Data Type | Input Method | Required (下書き) | Required (完了時) | Validation Rule | Error Message |
|---|---|---|---|---|---|---|---|
| **タイトル** ★ | `title` | string | Text input | **○** | **○** | Required | タイトルを入力してください |
| カテゴリ名 | `shelfName` | string | Dropdown (from master) | — | — | Must match master list | — |
| 提出先 | `caseName` | string | Dropdown (from master) | — | — | Must match master list | — |
| 案件 | `project` | string | Dropdown (from master) | — | — | Must match master list | — |
| **展開期間 (スタート月)** ★ | `deploymentStartMonth` | number (1–12) | Dropdown (current month + 3 months ahead) | — | — | Integer between 1 and 12 | — |
| **展開期間 (終了月)** ★ | `deploymentEndMonth` | number (1–12) | Auto-calculated; admin can override | — | — | Auto-set to startMonth + 1. Admin-only edit. | — |
| **棚割り幅 (ラベル)** ★ | `faceLabel` | string | Dropdown (per-manufacturer master) | — | — | Must match manufacturer's フェイスオプション list | — |
| 棚割り幅 (MAX幅) | `faceMaxWidth` | number (mm) | Auto-filled based on selected ラベル | — | — | Sum of (product width × facing count) must not exceed this value | 商品幅合計がフェイスMAX値（{MAX}mm）を超えているため完了できません。 |
| エントリシート補足情報 | `notes` | string | Textarea | — | — | — | — |
| 添付ファイル | `attachments` | Attachment[] | File upload | — | — | Max 25 MB per file | ファイルサイズは25MB以下にしてください: {filename} |

---

## Section 3: 変更履歴 (Change History) ★

Read-only. Automatically recorded by the system on every save or review action.

### Display Layout (per entry)

```
[ icon ]  Date & time (ja-JP locale)   Changed by (user name)
          Summary text (multi-line)
```

- Max **30 entries** retained (oldest are auto-deleted)
- List area max height: **288px**, scrollable
- When no history exists: displays "履歴はまだありません。"

### When is a history entry recorded?

#### Trigger A: On sheet save (PUT /api/sheets/[id])

The system compares the sheet data before and after saving and auto-generates a summary.

| Case | Summary content | Icon pattern |
|---|---|---|
| First-time creation | `新規作成: タイトル="{title}" / 商品件数={n}` | ⊕ Sky blue |
| Changes detected | Each changed field on a new line: `{label}: {before} -> {after}` | Determined by content (see icon rules below) |
| No changes | `変更なしで保存` | 📄 Gray |

Fields that are compared on save:

| Log label | Field |
|---|---|
| タイトル | `title` |
| 案件 | `caseName` |
| 補足 | `notes` |
| カテゴリ名 | `shelfName` |
| 作成者名 | `creatorName` |
| 作成者メール | `email` |
| 作成者電話 | `phoneNumber` |
| 状態 | `status` (e.g. `draft -> completed`) |
| 展開スタート月 | `deploymentStartMonth` |
| 展開終了月 | `deploymentEndMonth` |
| 棚割り幅 | `faceLabel` |
| フェイスMAX値 | `faceMaxWidth` |
| 商品件数 | `products.length` (only when count changes) |
| 商品N.商品名 | `products[n].productName` |
| 商品N.JAN | `products[n].janCode` |
| 商品N.リスク分類 | `products[n].riskClassification` |

#### Trigger B: On admin review action (POST /api/sheets/[id]/review)

| Admin action | Summary content | Icon pattern |
|---|---|---|
| Approve (承認) | `承認しました` | ✔ Emerald |
| Request revision (修正依頼) | `修正依頼: {comment text}` | ⚠ Orange |

### Icon Assignment Rules

Icons are determined by keyword matching against the summary text. Rules are evaluated top-to-bottom; first match wins.

| Priority | Keyword(s) in summary | Icon | Color |
|---|---|---|---|
| 1 | `修正依頼` | ⚠ AlertTriangle | Orange (`text-orange-600 bg-orange-100`) |
| 2 | `ステータス` / `状態` / `→` | ↺ RefreshCw | Amber (`text-amber-500 bg-amber-50`) |
| 3 | `承認` / `確定` / `完了` | ✔ CheckCircle | Emerald (`text-emerald-500 bg-emerald-50`) |
| 4 | `差戻` / `却下` / `返却` | ↩ RotateCcw | Rose (`text-rose-500 bg-rose-50`) |
| 5 | `商品` / `product` | 📦 Package | Violet (`text-violet-500 bg-violet-50`) |
| 6 | `作成` / `新規` / `追加` | ⊕ PlusCircle | Sky (`text-sky-500 bg-sky-50`) |
| 7 | `編集` / `更新` / `変更` | ✎ Edit3 | Blue (`text-blue-500 bg-blue-50`) |
| 8 | (no match) | 📄 FileText | Slate (`text-slate-400 bg-slate-100`) |

### Visual Example

```
変更履歴（直近）  [3件]

┌──────────────────────────────────────────────┐
│ ⊕  2025/04/01 10:00  田中 太郎               │
│    新規作成: タイトル="春の新商品"            │
│    / 商品件数=1                              │
├──────────────────────────────────────────────┤
│ ✎  2025/04/02 14:30  田中 太郎               │
│    タイトル: 春の新商品 ->                   │
│    春の新商品キャンペーン                    │
│    展開スタート月: 4 -> 5                    │
├──────────────────────────────────────────────┤
│ ⚠  2025/04/03 09:15  管理者                  │
│    修正依頼: 商品画像を添付してください       │
└──────────────────────────────────────────────┘
```

---

## Section 4: 商品情報 (Product Info)

Repeatable — one tab per product. At least 1 product is required.

| Field Label (UI) | Field Name | Data Type | Input Method | Required (下書き) | Required (完了時) | Validation Rule | Error Message |
|---|---|---|---|---|---|---|---|
| JANコード | `janCode` | string | Text input | ○ | ○ | 8, 13, or 16 digits only | (JAN format error) |
| 商品名 | `productName` | string | Text input | ○ | ○ | Required | — |
| 商品画像 | `productImage` | string (URL / Base64) | Image upload | — | ○ | Max 25 MB; min 1000px on short side; formats: AI, PNG, JPEG, EPS | — |
| **リスク分類** ★ | `riskClassification` | string | Dropdown (from master) | **○** | **○** | Required; must match master list | — |
| 特定成分 | `specificIngredients` | string[] | Checkboxes (multi-select from master) | — | — | Must match master list | — |
| 幅 (mm) | `width` | number | Number input | ○ | ○ | Integer > 0 | — |
| 高さ (mm) | `height` | number | Number input | ○ | ○ | Integer > 0 | — |
| 奥行 (mm) | `depth` | number | Number input | ○ | ○ | Integer > 0 | — |
| フェイシング数 | `facingCount` | number | Number input | ○ | ○ | Integer > 0 | — |
| 納品日 | `arrivalDate` | string (YYYY-MM-DD) | Date picker | — | — | YYYY-MM-DD format | — |
| キャッチコピー | `catchCopy` | string | Text input | — | — | — | — |
| 補足事項 | `productNotes` | string | Textarea | — | — | — | — |
| 添付ファイル（商品） | `productAttachments` | Attachment[] | File upload | — | — | Max 25 MB per file | ファイルサイズは25MB以下にしてください: {filename} |

### Tab status badge

Each product tab shows a badge computed from its current values:

| Badge | Condition |
|---|---|
| `完了` | All required fields filled |
| `入力中` | Some fields filled, some missing |
| `未入力` | No fields filled |

### Shelf width constraint

The system computes:

```
shelfWidthTotal = Σ (product.width × product.facingCount)
```

If `faceLabel` is selected, `shelfWidthTotal` must not exceed `faceMaxWidth`.  
Error: `商品幅合計がフェイスMAX値（{MAX}mm）を超えているため完了できません。`

---

## Section 5: 販促物情報 (Promotion Material Info)

Repeatable — one tab per promotion item. Optional section.

| Field Label (UI) | Field Name | Data Type | Input Method | Required (下書き) | Required (完了時) | Validation Rule | Error Message |
|---|---|---|---|---|---|---|---|
| 販促物有無 | `hasPromoMaterial` | `'yes'` \| `'no'` | Radio button | — | — | — | — |
| 香り見本・陳列売什器 | `specialFixture` | string | Text input | — | — | — | — |
| 幅 (mm) | `promoWidth` | number | Number input | — | — | — | — |
| 高さ (mm) | `promoHeight` | number | Number input | — | — | — | — |
| 奥行 (mm) | `promoDepth` | number | Number input | — | — | — | — |
| 販促物画像 | `promoImage` | string (URL) | Image upload | — | — | Max 25 MB | — |
| 納品日 | `deliveryDate` | string (YYYY-MM-DD) | Date picker | — | — | YYYY-MM-DD format | — |

---

## Section 6: 管理者メモ (Admin Memo) — Admin only

Visible and editable only by users with role `ADMIN`.

| Field Label (UI) | Field Name | Data Type | Input Method | Required (下書き) | Required (完了時) | Validation Rule | Error Message |
|---|---|---|---|---|---|---|---|
| 販促CD | `promoCode` | string | Text input | — | — | — | — |
| ボードピッキングJAN | `boardPickingJan` | string | Text input | — | — | — | — |
| 期限表URL | `deadlineTableUrl` | string | Text input | — | — | Max length enforced | 期限表URLは{N}文字以内で入力してください |
| 帯パターン | `bandPattern` | string | Text input | — | — | Max length enforced | 帯パターンは{N}文字以内で入力してください |
| 対象店舗数 | `targetStoreCount` | number | Number input | — | — | — | — |
| 印刷依頼数量 ボード① | `printBoard1Count` | number | Number input | — | — | — | — |
| 印刷依頼数量 ボード② | `printBoard2Count` | number | Number input | — | — | — | — |
| 印刷依頼数量 帯① | `printBand1Count` | number | Number input | — | — | — | — |
| 印刷依頼数量 帯② | `printBand2Count` | number | Number input | — | — | — | — |
| 印刷依頼数量 その他 | `printOther` | string | Text input | — | — | Max length enforced | 印刷依頼数量 その他は{N}文字以内で入力してください |
| 備品 | `equipmentNote` | string | Textarea | — | — | Max length enforced | 備品は{N}文字以内で入力してください |
| 備考 | `adminNote` | string | Textarea | — | — | Max length enforced | 備考は{N}文字以内で入力してください |

---

## Mandatory Fields Summary (★)

The following 5 fields are explicitly marked as must-have in the spec:

| Field | Section | Required at 下書き | Required at 完了時 |
|---|---|---|---|
| タイトル | 詳細情報 | ○ | ○ |
| 展開期間 (スタート月 / 終了月) | 詳細情報 | — | — |
| 棚割り幅 (ラベル / MAX幅) | 詳細情報 | — | — (but MAX幅 constraint applies on 完了) |
| 変更履歴 | 変更履歴 | Auto-recorded, read-only | — |
| リスク分類 | 商品情報 (per product) | ○ | ○ |

---

## File Attachment Rules (common)

| Rule | Value |
|---|---|
| Max file size | 25 MB |
| Supported image formats (product / promo) | AI, PNG, JPEG, EPS |
| Min image resolution (product image) | 1000px on the short side |

---

## API Endpoints (reference)

| Method | Path | Description |
|---|---|---|
| GET | `/api/sheets/[id]` | Fetch sheet detail |
| PUT | `/api/sheets/[id]` | Save / update sheet |
| POST | `/api/sheets/[id]/review` | Admin approve or request revision |
| GET | `/api/sheets/[id]/revisions` | Fetch 変更履歴 list |
