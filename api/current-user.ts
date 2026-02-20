import { getCurrentUser } from './_lib/auth.js';
import {
  clearSessionCookie,
  getSessionUserId,
  getMethod,
  methodNotAllowed,
  sanitizeUser,
  sendJson,
} from './_lib/http.js';

export default async function handler(req: any, res: any) {
  const method = getMethod(req);

  if (method === 'GET') {
    const sessionUserId = getSessionUserId(req);
    const currentUser = await getCurrentUser(req);
    if (sessionUserId && !currentUser) {
      clearSessionCookie(res);
    }
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
