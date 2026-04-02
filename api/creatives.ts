import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, sendError, sendJson } from './_lib/http.js';
import * as CreativeRepository from './_lib/repositories/creatives.js';

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can access creatives');
    return;
  }

  await CreativeRepository.pruneRetentionIfDue();

  if (method === 'GET') {
    const creatives = await CreativeRepository.findAll();
    sendJson(res, 200, creatives);
    return;
  }

  methodNotAllowed(res);
}
