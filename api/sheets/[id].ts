import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { deleteUnusedManagedBlobUrls, normalizeSheetMedia } from '../_lib/media.js';
import { EntrySheet, EntrySheetAdminMemo } from '../_lib/types.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface PutSheetBody {
  sheet?: EntrySheet;
}

const MAX_GENERAL_TEXT_LENGTH = 4000;
const PROMO_CODE_PATTERN = /^X\d{6}$/;
const JAN_13_PATTERN = /^\d{13}$/;

const getSheetId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

const normalizeStatus = (
  value: string | undefined
): 'draft' | 'completed' | 'completed_no_image' => {
  if (value === 'completed') return 'completed';
  if (value === 'completed_no_image') return 'completed_no_image';
  return 'draft';
};

const normalizeProducts = (
  incoming: EntrySheet['products'] | undefined,
  fallbackManufacturerName: string
): EntrySheet['products'] => {
  if (!Array.isArray(incoming)) return [];
  return incoming.map((product) => ({
    ...product,
    // Product manufacturer must always match sheet owner manufacturer.
    manufacturerName: fallbackManufacturerName,
    janCode: String(product.janCode || '').trim(),
    productName: String(product.productName || '').trim(),
    shelfName: String(product.shelfName || '').trim(),
  }));
};

const isTooLong = (value: string | undefined): boolean =>
  typeof value === 'string' && value.length > MAX_GENERAL_TEXT_LENGTH;

const findTooLongField = (sheet: EntrySheet): string | null => {
  if (isTooLong(sheet.title)) return 'タイトル';
  if (isTooLong(sheet.notes)) return 'エントリシート補足情報';
  if (isTooLong(sheet.email)) return '担当者メール';
  if (isTooLong(sheet.phoneNumber)) return '担当者電話番号';
  if (isTooLong(sheet.adminMemo?.bandPattern)) return '帯パターン';
  if (isTooLong(sheet.adminMemo?.printOther)) return '印刷依頼数量 その他';
  if (isTooLong(sheet.adminMemo?.equipmentNote)) return '備品';
  if (isTooLong(sheet.adminMemo?.adminNote)) return '備考';

  for (let i = 0; i < sheet.products.length; i += 1) {
    const product = sheet.products[i];
    const prefix = `商品${i + 1}`;
    if (isTooLong(product.shelfName)) return `${prefix} 棚割名`;
    if (isTooLong(product.productName)) return `${prefix} 商品名`;
    if (isTooLong(product.janCode)) return `${prefix} JANコード`;
    if (isTooLong(product.catchCopy)) return `${prefix} キャッチコピー`;
    if (isTooLong(product.productMessage)) return `${prefix} 商品メッセージ`;
    if (isTooLong(product.productNotes)) return `${prefix} 補足事項`;
    if (isTooLong(product.promoSample)) return `${prefix} 香り・色見本`;
    if (isTooLong(product.specialFixture)) return `${prefix} 特殊な陳列什器`;
  }

  return null;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
};

const toOptionalMonthNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return undefined;
  return parsed;
};

const normalizeAdminMemo = (
  incoming: EntrySheetAdminMemo | undefined,
  existing: EntrySheetAdminMemo | undefined,
  editable: boolean
): EntrySheetAdminMemo | undefined => {
  if (!editable) return existing;
  return {
    promoCode: String(incoming?.promoCode || '').trim() || undefined,
    boardPickingJan: String(incoming?.boardPickingJan || '').trim() || undefined,
    bandPattern: String(incoming?.bandPattern || '').trim() || undefined,
    targetStoreCount: toOptionalNumber(incoming?.targetStoreCount),
    printBoard1Count: toOptionalNumber(incoming?.printBoard1Count),
    printBoard2Count: toOptionalNumber(incoming?.printBoard2Count),
    printBand1Count: toOptionalNumber(incoming?.printBand1Count),
    printBand2Count: toOptionalNumber(incoming?.printBand2Count),
    printOther: String(incoming?.printOther || '').trim() || undefined,
    equipmentNote: String(incoming?.equipmentNote || '').trim() || undefined,
    adminNote: String(incoming?.adminNote || '').trim() || undefined,
  };
};

const validateAdminMemo = (memo: EntrySheetAdminMemo | undefined): string | null => {
  if (!memo) return null;
  if (memo.promoCode && !PROMO_CODE_PATTERN.test(memo.promoCode)) {
    return '販促CDは X000000 形式で入力してください';
  }
  if (memo.boardPickingJan && !JAN_13_PATTERN.test(memo.boardPickingJan)) {
    return 'ボードピッキングJANは13桁の数字で入力してください';
  }
  return null;
};

const buildRevisionSummary = (before: EntrySheet | null, after: EntrySheet): string => {
  if (!before) {
    return `新規作成: タイトル="${after.title}" / 商品件数=${after.products.length}`;
  }

  const changes: string[] = [];
  const pushChange = (label: string, prev: unknown, next: unknown) => {
    const left = prev == null || prev === '' ? '(空)' : String(prev);
    const right = next == null || next === '' ? '(空)' : String(next);
    if (left !== right) {
      changes.push(`${label}: ${left} -> ${right}`);
    }
  };

  pushChange('タイトル', before.title, after.title);
  pushChange('補足', before.notes || '', after.notes || '');
  pushChange('担当者名', before.creatorName, after.creatorName);
  pushChange('担当者メール', before.email, after.email);
  pushChange('担当者電話', before.phoneNumber, after.phoneNumber);
  pushChange('状態', before.status, after.status);
  pushChange('展開スタート月', before.deploymentStartMonth, after.deploymentStartMonth);

  pushChange('Adminメモ.販促CD', before.adminMemo?.promoCode, after.adminMemo?.promoCode);
  pushChange(
    'Adminメモ.ボードピッキングJAN',
    before.adminMemo?.boardPickingJan,
    after.adminMemo?.boardPickingJan
  );
  pushChange('Adminメモ.帯パターン', before.adminMemo?.bandPattern, after.adminMemo?.bandPattern);
  pushChange(
    'Adminメモ.対象店舗数',
    before.adminMemo?.targetStoreCount,
    after.adminMemo?.targetStoreCount
  );
  pushChange('Adminメモ.備品', before.adminMemo?.equipmentNote, after.adminMemo?.equipmentNote);
  pushChange('Adminメモ.備考', before.adminMemo?.adminNote, after.adminMemo?.adminNote);

  if (before.products.length !== after.products.length) {
    changes.push(`商品件数: ${before.products.length} -> ${after.products.length}`);
  }

  const minLen = Math.min(before.products.length, after.products.length);
  for (let i = 0; i < minLen; i += 1) {
    const prev = before.products[i];
    const next = after.products[i];
    const prefix = `商品${i + 1}`;
    pushChange(`${prefix}.商品名`, prev.productName, next.productName);
    pushChange(`${prefix}.JAN`, prev.janCode, next.janCode);
    pushChange(`${prefix}.棚割名`, prev.shelfName, next.shelfName);
    pushChange(`${prefix}.リスク分類`, prev.riskClassification, next.riskClassification);
  }

  if (changes.length === 0) return '変更なしで保存';
  return changes.slice(0, 80).join('\n');
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  if (method !== 'PUT' && method !== 'DELETE') {
    methodNotAllowed(res);
    return;
  }

  const sheetId = getSheetId(req);
  if (!sheetId) {
    sendError(res, 400, 'Sheet id is required');
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (method === 'PUT') {
    const body = await readJsonBody<PutSheetBody>(req);
    const sheet = body.sheet;
    if (!sheet) {
      sendError(res, 400, 'sheet is required');
      return;
    }

    const existingSheet = await SheetRepository.findById(sheetId);

    // Server-authoritative save DTO:
    // - New sheet: always owned by current session user
    // - Existing sheet: preserve immutable owner id/manufacturer from existing record
    // - Header fields (creatorName/email/phoneNumber) are editable and stored as snapshots
    const ownerManufacturer = existingSheet?.manufacturerName || currentUser.manufacturerName;
    const ownerCreatorId = existingSheet?.creatorId || currentUser.id;
    const canEditAdminMemo = isAdmin(currentUser);

    const safeSheet: EntrySheet = {
      ...sheet,
      id: sheetId,
      manufacturerName: ownerManufacturer,
      creatorId: ownerCreatorId,
      creatorName: String(sheet.creatorName || existingSheet?.creatorName || currentUser.displayName || '').trim(),
      email: String(sheet.email || existingSheet?.email || currentUser.email || '').trim(),
      phoneNumber: String(sheet.phoneNumber || existingSheet?.phoneNumber || currentUser.phoneNumber || '').trim(),
      title: String(sheet.title || '').trim(),
      notes: sheet.notes ? String(sheet.notes).trim() : '',
      deploymentStartMonth: toOptionalMonthNumber(sheet.deploymentStartMonth),
      adminMemo: normalizeAdminMemo(sheet.adminMemo, existingSheet?.adminMemo, canEditAdminMemo),
      status: normalizeStatus(sheet.status),
      createdAt: existingSheet?.createdAt || sheet.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: normalizeProducts(sheet.products, ownerManufacturer),
      attachments: Array.isArray(sheet.attachments) ? sheet.attachments : [],
    };

    if (safeSheet.products.length === 0) {
      sendError(res, 400, 'At least one product is required');
      return;
    }
    const tooLongField = findTooLongField(safeSheet);
    if (tooLongField) {
      sendError(res, 400, `${tooLongField}は${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
      return;
    }
    const adminMemoValidationError = validateAdminMemo(safeSheet.adminMemo);
    if (adminMemoValidationError) {
      sendError(res, 400, adminMemoValidationError);
      return;
    }

    if (!canAccessManufacturer(currentUser, safeSheet.manufacturerName)) {
      sendError(res, 403, 'You can only save sheets in your manufacturer');
      return;
    }

    // Get existing sheet for blob cleanup
    const beforeSheets = existingSheet ? [existingSheet] : [];

    // Normalize media URLs (convert data URLs to Vercel Blob)
    let normalizedSheet: EntrySheet;
    try {
      normalizedSheet = await normalizeSheetMedia(
        safeSheet,
        `pharmapop/sheets/${safeSheet.id}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid media payload';
      sendError(res, 400, message);
      return;
    }

    // Permission check for existing sheet
    if (existingSheet && !canAccessManufacturer(currentUser, existingSheet.manufacturerName)) {
      sendError(res, 403, 'You cannot modify this sheet');
      return;
    }

    // STAFF cannot mark completed for other manufacturers (defense-in-depth).
    if (!isAdmin(currentUser) && safeSheet.manufacturerName !== currentUser.manufacturerName) {
      sendError(res, 403, 'You can only save sheets in your manufacturer');
      return;
    }

    // Save to database
    try {
      await SheetRepository.upsert(
        { ...normalizedSheet, id: sheetId },
        {
          changedByUserId: currentUser.id,
          changedByName: currentUser.displayName || currentUser.username,
          summary: buildRevisionSummary(existingSheet, safeSheet),
          keepLatestCount: 30,
        }
      );
    } catch (error) {
      // DB save failed after media normalization/upload.
      // Delete newly uploaded blobs that are not part of the previous persisted sheet.
      await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
      const message = error instanceof Error ? error.message : 'Failed to save sheet';
      sendError(res, 500, message);
      return;
    }

    sendJson(res, 200, { ok: true });
    // Clean up unused blob URLs in background to reduce response latency.
    void deleteUnusedManagedBlobUrls(beforeSheets, [normalizedSheet]).catch((error) => {
      console.warn('Deferred blob cleanup failed after save:', error);
    });
    return;
  }

  // DELETE
  const target = await SheetRepository.findById(sheetId);
  if (!target) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  if (!canAccessManufacturer(currentUser, target.manufacturerName)) {
    sendError(res, 403, 'You cannot delete this sheet');
    return;
  }

  // Delete from database
  await SheetRepository.deleteById(sheetId);

  sendJson(res, 200, { ok: true });
  // Clean up blob URLs in background to reduce response latency.
  void deleteUnusedManagedBlobUrls([target], []).catch((error) => {
    console.warn('Deferred blob cleanup failed after delete:', error);
  });
}
