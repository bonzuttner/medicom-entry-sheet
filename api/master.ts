import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { MasterData } from './_lib/types.js';
import * as MasterRepository from './_lib/repositories/masters.js';

interface PutMasterBody {
  data?: MasterData;
}

export default async function handler(req: any, res: any) {
  const method = getMethod(req);

  if (method === 'GET') {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can view master data');
      return;
    }
    const masterData = await MasterRepository.getAll();
    sendJson(res, 200, masterData);
    return;
  }

  if (method === 'PUT') {
    const currentUser = await requireUser(req, res);
    if (!currentUser) return;
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can update master data');
      return;
    }

    const body = await readJsonBody<PutMasterBody>(req);
    if (!body.data) {
      sendError(res, 400, 'data is required');
      return;
    }

    const updated = await MasterRepository.updateAll(body.data);
    sendJson(res, 200, updated);
    return;
  }

  methodNotAllowed(res);
}
