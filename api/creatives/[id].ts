import { isAdmin, requireUser } from '../_lib/auth.js';
import { Creative } from '../_lib/types.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import * as CreativeRepository from '../_lib/repositories/creatives.js';

interface PutCreativeBody {
  creative?: Creative;
  forceOverwrite?: boolean;
}

const getCreativeId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const creativeId = getCreativeId(req);
  if (!creativeId) {
    sendError(res, 400, 'Creative id is required');
    return;
  }

  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can access creatives');
    return;
  }

  await CreativeRepository.pruneRetentionIfDue();

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
  }
}
