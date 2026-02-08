import { createHmac, timingSafeEqual } from 'crypto';
import { User } from './types';

const SESSION_COOKIE_NAME = 'pharmapop_session_user';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const getMethod = (req: any): string => String(req.method || 'GET').toUpperCase();

export const sendJson = (res: any, status: number, body: unknown): void => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(body);
    return;
  }

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

export const sendError = (res: any, status: number, message: string): void => {
  sendJson(res, status, { error: message });
};

export const methodNotAllowed = (res: any): void => {
  sendError(res, 405, 'Method not allowed');
};

export const parseCookies = (req: any): Record<string, string> => {
  const header = req.headers?.cookie;
  if (!header) return {};

  return String(header)
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, cookie) => {
      const idx = cookie.indexOf('=');
      if (idx < 0) return acc;
      const key = cookie.slice(0, idx);
      const val = cookie.slice(idx + 1);
      acc[key] = decodeURIComponent(val);
      return acc;
    }, {});
};

const setCookieHeader = (res: any, cookieValue: string): void => {
  const existing = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined;
  const next = Array.isArray(existing)
    ? [...existing, cookieValue]
    : existing
      ? [String(existing), cookieValue]
      : [cookieValue];
  res.setHeader('Set-Cookie', next);
};

const signSessionUserId = (userId: string): string =>
  createHmac('sha256', SESSION_SECRET).update(userId).digest('hex');

const createCookiePayload = (userId: string): string => `${userId}.${signSessionUserId(userId)}`;

const verifyCookiePayload = (payload: string): string | null => {
  const [userId, signature] = payload.split('.');
  if (!userId || !signature) return null;

  const expected = signSessionUserId(userId);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  return userId;
};

const buildCookieAttributes = (extras: string[] = []): string => {
  const base = ['Path=/', 'HttpOnly', 'SameSite=Lax', ...extras];
  if (IS_PRODUCTION) {
    base.push('Secure');
  }
  return base.join('; ');
};

export const setSessionCookie = (res: any, userId: string): void => {
  setCookieHeader(
    res,
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(createCookiePayload(userId))}; ${buildCookieAttributes([`Max-Age=${SESSION_MAX_AGE_SECONDS}`])}`
  );
};

export const clearSessionCookie = (res: any): void => {
  setCookieHeader(
    res,
    `${SESSION_COOKIE_NAME}=; ${buildCookieAttributes(['Max-Age=0'])}`
  );
};

export const getSessionUserId = (req: any): string | null => {
  const cookies = parseCookies(req);
  const payload = cookies[SESSION_COOKIE_NAME];
  if (!payload) return null;
  return verifyCookiePayload(payload);
};

export const readJsonBody = async <T>(req: any): Promise<T> => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return (req.body ? JSON.parse(req.body) : {}) as T;
    }
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve());
    req.on('error', (error: unknown) => reject(error));
  });

  if (chunks.length === 0) {
    return {} as T;
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return (raw ? JSON.parse(raw) : {}) as T;
};

export const sanitizeUser = (user: User): User => {
  const { password, ...safeUser } = user;
  return safeUser;
};
