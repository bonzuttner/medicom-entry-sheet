import { promises as fs } from 'fs';
import path from 'path';

interface AttemptState {
  firstFailedAt: number;
  failedCount: number;
  lockedUntil?: number;
}

interface RateLimitStore {
  attempts: Record<string, AttemptState>;
}

const STORE_PATH = path.join('/tmp', 'pharmapop-login-attempts.json');
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const getClientIp = (req: any): string => {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

const buildKey = (req: any, username: string): string => {
  const ip = getClientIp(req);
  return `${ip}:${username.trim().toLowerCase()}`;
};

const readStore = async (): Promise<RateLimitStore> => {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as RateLimitStore;
  } catch {
    return { attempts: {} };
  }
};

const writeStore = async (data: RateLimitStore): Promise<void> => {
  await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf8');
};

const cleanupExpired = (store: RateLimitStore, now: number): void => {
  for (const [key, state] of Object.entries(store.attempts)) {
    const lockExpired = !state.lockedUntil || state.lockedUntil <= now;
    const windowExpired = state.firstFailedAt + WINDOW_MS <= now;
    if (lockExpired && windowExpired) {
      delete store.attempts[key];
    }
  }
};

export const getLoginRateLimitStatus = async (
  req: any,
  username: string
): Promise<{ limited: boolean; retryAfterSeconds: number }> => {
  const now = Date.now();
  const store = await readStore();
  cleanupExpired(store, now);

  const key = buildKey(req, username);
  const state = store.attempts[key];
  if (!state?.lockedUntil || state.lockedUntil <= now) {
    await writeStore(store);
    return { limited: false, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((state.lockedUntil - now) / 1000)
  );
  await writeStore(store);
  return { limited: true, retryAfterSeconds };
};

export const recordLoginFailure = async (req: any, username: string): Promise<void> => {
  const now = Date.now();
  const key = buildKey(req, username);
  const store = await readStore();
  cleanupExpired(store, now);

  const current = store.attempts[key];
  if (!current || current.firstFailedAt + WINDOW_MS <= now) {
    store.attempts[key] = {
      firstFailedAt: now,
      failedCount: 1,
    };
    await writeStore(store);
    return;
  }

  const nextFailedCount = current.failedCount + 1;
  store.attempts[key] = {
    ...current,
    failedCount: nextFailedCount,
    lockedUntil: nextFailedCount >= MAX_ATTEMPTS ? now + LOCK_MS : current.lockedUntil,
  };
  await writeStore(store);
};

export const clearLoginFailures = async (req: any, username: string): Promise<void> => {
  const store = await readStore();
  const key = buildKey(req, username);
  if (store.attempts[key]) {
    delete store.attempts[key];
    await writeStore(store);
  }
};
