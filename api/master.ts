import { isAdmin, requireUser } from './_lib/auth';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from './_lib/http';
import { readStore, writeStore } from './_lib/store';
import { MasterData } from './_lib/types';

interface PutMasterBody {
  data?: MasterData;
}

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const store = await readStore();

  if (method === 'GET') {
    sendJson(res, 200, store.master);
    return;
  }

  if (method === 'PUT') {
    const currentUser = requireUser(req, res, store);
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

    store.master = body.data;
    await writeStore(store);
    sendJson(res, 200, store.master);
    return;
  }

  methodNotAllowed(res);
}
