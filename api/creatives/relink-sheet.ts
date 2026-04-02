import { isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import * as CreativeRepository from '../_lib/repositories/creatives.js';

interface RelinkSheetBody {
  sheetId?: string;
  targetCreativeId?: string;
}

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'PUT') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;
  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can access creatives');
    return;
  }

  const body = await readJsonBody<RelinkSheetBody>(req);
  if (!body.sheetId) {
    sendError(res, 400, 'Sheet id is required');
    return;
  }
  if (!body.targetCreativeId) {
    sendError(res, 400, 'Target creative id is required');
    return;
  }

  try {
    const result = await CreativeRepository.relinkSheetToCreative(body.sheetId, body.targetCreativeId);
    sendJson(res, 200, { ok: true, sheet: result.sheet, creative: result.creative });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to relink creative';
    if (
      message === 'SHEET_NOT_FOUND' ||
      message === 'SHEET_MANUFACTURER_MISMATCH' ||
      message === 'TARGET_CREATIVE_NOT_FOUND'
    ) {
      sendError(res, 400, message);
      return;
    }
    sendError(res, 500, message);
  }
}
