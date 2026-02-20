import {
  clearLoginFailures,
  getLoginRateLimitStatus,
  recordLoginFailure,
} from '../_lib/loginRateLimit.js';
import { verifyPassword } from '../_lib/password.js';
import {
  clearSessionCookie,
  getMethod,
  methodNotAllowed,
  readJsonBody,
  sanitizeUser,
  sendJson,
  setSessionCookie,
} from '../_lib/http.js';
import * as UserRepository from '../_lib/repositories/users.js';

interface LoginBody {
  username?: string;
  password?: string;
}

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const { username, password } = await readJsonBody<LoginBody>(req);
  if (!username || !password) {
    sendJson(res, 400, { error: 'username and password are required' });
    return;
  }

  const rateLimit = await getLoginRateLimitStatus(req, username);
  if (rateLimit.limited) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, {
      error: `Too many login attempts. Retry in ${rateLimit.retryAfterSeconds} seconds.`,
    });
    return;
  }

  const user = await UserRepository.findByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    await recordLoginFailure(req, username);
    clearSessionCookie(res);
    sendJson(res, 200, null);
    return;
  }

  await clearLoginFailures(req, username);
  setSessionCookie(res, user.id);
  sendJson(res, 200, sanitizeUser(user));
}
