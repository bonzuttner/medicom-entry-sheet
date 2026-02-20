import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { deleteUnusedManagedBlobUrls, normalizeSheetMedia } from '../_lib/media.js';
import { EntrySheet } from '../_lib/types.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface PutSheetBody {
  sheet?: EntrySheet;
}

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
    manufacturerName: product.manufacturerName || fallbackManufacturerName,
    janCode: String(product.janCode || '').trim(),
    productName: String(product.productName || '').trim(),
    shelfName: String(product.shelfName || '').trim(),
  }));
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
    // - Existing sheet: preserve immutable ownership fields from existing record
    const ownerManufacturer = existingSheet?.manufacturerName || currentUser.manufacturerName;
    const ownerCreatorId = existingSheet?.creatorId || currentUser.id;
    const ownerCreatorName = existingSheet?.creatorName || currentUser.displayName;

    const safeSheet: EntrySheet = {
      ...sheet,
      id: sheetId,
      manufacturerName: ownerManufacturer,
      creatorId: ownerCreatorId,
      creatorName: ownerCreatorName,
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
    let savedSheet: EntrySheet;
    try {
      savedSheet = await SheetRepository.upsert({ ...normalizedSheet, id: sheetId });
    } catch (error) {
      // DB save failed after media normalization/upload.
      // Delete newly uploaded blobs that are not part of the previous persisted sheet.
      await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
      const message = error instanceof Error ? error.message : 'Failed to save sheet';
      sendError(res, 500, message);
      return;
    }

    // Clean up unused blob URLs
    await deleteUnusedManagedBlobUrls(beforeSheets, [savedSheet]);

    sendJson(res, 200, { ok: true });
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

  // Clean up blob URLs
  await deleteUnusedManagedBlobUrls([target], []);

  sendJson(res, 200, { ok: true });
}
