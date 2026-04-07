import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { Creative } from '../_lib/types.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import * as CreativeRepository from '../_lib/repositories/creatives.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface SaveCreativeBody {
  mode?: 'save';
  creative?: Creative;
  forceOverwrite?: boolean;
}

interface RelinkSheetBody {
  mode: 'relink';
  sheetId?: string;
  targetCreativeId?: string;
}

type PutCreativeBody = SaveCreativeBody | RelinkSheetBody;

const getQueryValue = (raw: unknown): string | null => {
  if (Array.isArray(raw)) return raw[0] || null;
  return typeof raw === 'string' ? raw : null;
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  await CreativeRepository.pruneRetentionIfDue();

  if (method === 'GET') {
    const sheetId = getQueryValue(req.query?.sheetId);
    const creativeId = getQueryValue(req.query?.id);

    if (sheetId) {
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

    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can access creatives');
      return;
    }

    if (creativeId) {
      const creative = await CreativeRepository.findById(creativeId);
      if (!creative) {
        sendError(res, 404, 'Creative not found');
        return;
      }
      sendJson(res, 200, creative);
      return;
    }

    const creatives = await CreativeRepository.findAll();
    sendJson(res, 200, creatives);
    return;
  }

  if (method === 'PUT') {
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can access creatives');
      return;
    }

    const body = await readJsonBody<PutCreativeBody>(req);

    if (body.mode === 'relink') {
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
          message === 'TARGET_CREATIVE_NOT_FOUND' ||
          message === 'SHEET_WORKFLOW_LOCKED'
        ) {
          sendError(res, 400, message);
          return;
        }
        sendError(res, 500, message);
        return;
      }
    }

    if (!body.creative) {
      sendError(res, 400, 'creative is required');
      return;
    }
    try {
      const saved = await CreativeRepository.upsert(body.creative, {
        expectedVersion: body.creative.version,
        forceOverwrite: body.forceOverwrite === true,
      });
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
      if (
        message === 'SHEET_NOT_FOUND' ||
        message === 'SHEET_MANUFACTURER_MISMATCH' ||
        message === 'SHEET_WORKFLOW_LOCKED'
      ) {
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
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can access creatives');
      return;
    }
    const creativeId = getQueryValue(req.query?.id);
    if (!creativeId) {
      sendError(res, 400, 'Creative id is required');
      return;
    }
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
