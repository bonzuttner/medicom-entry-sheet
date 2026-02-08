import { getCurrentUser } from './_lib/auth';
import {
  clearSessionCookie,
  getMethod,
  methodNotAllowed,
  sanitizeUser,
  sendJson,
} from './_lib/http';
import { readStore } from './_lib/store';

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const store = await readStore();

  if (method === 'GET') {
    const currentUser = getCurrentUser(req, store);
    sendJson(res, 200, currentUser ? sanitizeUser(currentUser) : null);
    return;
  }

  if (method === 'DELETE') {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  methodNotAllowed(res);
}
