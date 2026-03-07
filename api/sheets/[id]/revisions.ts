import { canAccessManufacturer, requireUser } from '../../_lib/auth.js';
import { getMethod, methodNotAllowed, sendError, sendJson } from '../../_lib/http.js';
import * as SheetRepository from '../../_lib/repositories/sheets.js';

const getSheetId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
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

  const target = await SheetRepository.findById(sheetId);
  if (!target) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  if (!canAccessManufacturer(currentUser, target.manufacturerName)) {
    sendError(res, 403, 'You cannot access this sheet');
    return;
  }

  const revisions = await SheetRepository.listRevisionsBySheetId(sheetId);
  sendJson(res, 200, revisions);
}
