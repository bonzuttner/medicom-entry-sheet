import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { Creative } from '../_lib/types.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import * as CreativeRepository from '../_lib/repositories/creatives.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface PutCreativeBody {
  creative?: Creative;
  forceOverwrite?: boolean;
}

interface RelinkSheetBody {
  sheetId?: string;
  targetCreativeId?: string;
}

const getPathSegments = (req: any): string[] => {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw ? [raw] : [];
};

const getSheetId = (req: any): string | null => {
  const raw = req.query?.sheetId;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const segments = getPathSegments(req);
  const [first] = segments;

  await CreativeRepository.pruneRetentionIfDue();

  if (segments.length === 0) {
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can access creatives');
      return;
    }
    if (method === 'GET') {
      const creatives = await CreativeRepository.findAll();
      sendJson(res, 200, creatives);
      return;
    }
    methodNotAllowed(res);
    return;
  }

  if (first === 'by-sheet') {
    if (method !== 'GET') {
      methodNotAllowed(res);
      return;
    }
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
    sendJson(res, 200, creative || null);
    return;
  }

  if (first === 'relink-sheet') {
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can access creatives');
      return;
    }
    if (method !== 'PUT') {
      methodNotAllowed(res);
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
      return;
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
      return;
    }
  }

  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can access creatives');
    return;
  }

  const creativeId = first;
  if (!creativeId) {
    sendError(res, 400, 'Creative id is required');
    return;
  }

  if (method === 'GET') {
    const creative = await CreativeRepository.findById(creativeId);
    if (!creative) {
      sendError(res, 404, 'Creative not found');
      return;
    }
    sendJson(res, 200, creative);
    return;
  }

  if (method === 'PUT') {
    const body = await readJsonBody<PutCreativeBody>(req);
    if (!body.creative) {
      sendError(res, 400, 'creative is required');
      return;
    }
    try {
      const saved = await CreativeRepository.upsert(
        {
          ...body.creative,
          id: creativeId,
        },
        {
          expectedVersion: body.creative.version,
          forceOverwrite: body.forceOverwrite === true,
        }
      );
      sendJson(res, 200, { ok: true, creative: saved });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save creative';
      if (message === 'VERSION_CONFLICT') {
        sendError(res, 409, 'VERSION_CONFLICT');
        return;
      }
      if (message === 'SHEET_ALREADY_LINKED') {
        sendError(res, 409, 'SHEET_ALREADY_LINKED');
        return;
      }
      if (message === 'SHEET_NOT_FOUND' || message === 'SHEET_MANUFACTURER_MISMATCH') {
        sendError(res, 400, message);
        return;
      }
      if (message === 'CREATIVE_REQUIRED_FIELDS' || message === 'MANUFACTURER_NOT_FOUND') {
        sendError(res, 400, message);
        return;
      }
      sendError(res, 500, message);
      return;
    }
  }

  if (method === 'DELETE') {
    try {
      const deleted = await CreativeRepository.deleteById(creativeId);
      if (!deleted) {
        sendError(res, 404, 'Creative not found');
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete creative';
      if (message === 'CREATIVE_STILL_LINKED') {
        sendError(res, 409, 'CREATIVE_STILL_LINKED');
        return;
      }
      sendError(res, 500, message);
      return;
    }
  }

  methodNotAllowed(res);
}
