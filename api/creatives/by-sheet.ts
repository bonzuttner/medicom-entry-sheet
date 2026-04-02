import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, sendError, sendJson } from '../_lib/http.js';
import * as CreativeRepository from '../_lib/repositories/creatives.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

const getSheetId = (req: any): string | null => {
  const raw = req.query?.sheetId;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const sheetId = getSheetId(req);
  if (!sheetId) {
    sendError(res, 400, 'Sheet id is required');
    return;
  }

  const sheet = await SheetRepository.findById(sheetId);
  if (!sheet) {
    sendError(res, 404, 'Sheet not found');
    return;
  }
  if (!isAdmin(currentUser) && !canAccessManufacturer(currentUser, sheet.manufacturerName)) {
    sendError(res, 403, 'You cannot access this sheet');
    return;
  }

  const creative = await CreativeRepository.findBySheetId(sheetId);
  if (!creative) {
    sendJson(res, 200, null);
    return;
  }

  sendJson(res, 200, creative);
}
