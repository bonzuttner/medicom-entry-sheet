import { canAccessManufacturer, requireUser } from '../_lib/auth';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http';
import { normalizeSheetMedia } from '../_lib/media';
import { pruneSheetsByRetention } from '../_lib/retention';
import { readStore, writeStore } from '../_lib/store';
import { EntrySheet } from '../_lib/types';

interface PutSheetBody {
  sheet?: EntrySheet;
}

const getSheetId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
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

  const store = await readStore();
  const prunedSheets = pruneSheetsByRetention(store.sheets);
  if (prunedSheets.length !== store.sheets.length) {
    store.sheets = prunedSheets;
    await writeStore(store);
  }
  const currentUser = requireUser(req, res, store);
  if (!currentUser) return;

  if (method === 'PUT') {
    const body = await readJsonBody<PutSheetBody>(req);
    const sheet = body.sheet;
    if (!sheet) {
      sendError(res, 400, 'sheet is required');
      return;
    }

    if (!canAccessManufacturer(currentUser, sheet.manufacturerName)) {
      sendError(res, 403, 'You can only save sheets in your manufacturer');
      return;
    }

    let normalizedSheet: EntrySheet;
    try {
      normalizedSheet = await normalizeSheetMedia(
        sheet,
        `pharmapop/sheets/${sheet.id}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid media payload';
      sendError(res, 400, message);
      return;
    }

    const existingIndex = store.sheets.findIndex((s) => s.id === sheetId);
    if (existingIndex >= 0) {
      const existingSheet = store.sheets[existingIndex];
      if (!canAccessManufacturer(currentUser, existingSheet.manufacturerName)) {
        sendError(res, 403, 'You cannot modify this sheet');
        return;
      }
      store.sheets[existingIndex] = { ...normalizedSheet, id: sheetId };
    } else {
      store.sheets.push({ ...normalizedSheet, id: sheetId });
    }

    store.sheets = pruneSheetsByRetention(store.sheets);
    await writeStore(store);
    sendJson(res, 200, { ok: true });
    return;
  }

  const target = store.sheets.find((sheet) => sheet.id === sheetId);
  if (!target) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  if (!canAccessManufacturer(currentUser, target.manufacturerName)) {
    sendError(res, 403, 'You cannot delete this sheet');
    return;
  }

  store.sheets = store.sheets.filter((sheet) => sheet.id !== sheetId);
  store.sheets = pruneSheetsByRetention(store.sheets);
  await writeStore(store);
  sendJson(res, 200, { ok: true });
}
