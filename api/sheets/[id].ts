import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { deleteUnusedManagedBlobUrls, normalizeSheetMedia } from '../_lib/media.js';
import { EntrySheet } from '../_lib/types.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface PutSheetBody {
  sheet?: EntrySheet;
}

const MAX_GENERAL_TEXT_LENGTH = 4000;

const getSheetId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

const normalizeStatus = (value: string | undefined): 'draft' | 'completed' =>
  value === 'completed' ? 'completed' : 'draft';

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
      await SheetRepository.upsert({ ...normalizedSheet, id: sheetId });
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
