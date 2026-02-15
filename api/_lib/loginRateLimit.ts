import { promises as fs } from 'fs';
import path from 'path';
import { hasKvConfig, runKvCommand } from './kv';
import { isProductionRuntime } from './runtime';

interface AttemptState {
  firstFailedAt: number;
  failedCount: number;
  lockedUntil?: number;
}

interface RateLimitStore {
  attempts: Record<string, AttemptState>;
}

const STORE_PATH = path.join('/tmp', 'pharmapop-login-attempts.json');
const KEY_PREFIX = 'pharmapop:login-attempt:';
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

const readStoreFromFile = async (): Promise<RateLimitStore> => {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as RateLimitStore;
  } catch {
    return { attempts: {} };
  }
};

const writeStoreToFile = async (data: RateLimitStore): Promise<void> => {
  await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf8');
};

const readAttemptFromKv = async (key: string): Promise<AttemptState | null> => {
  const raw = await runKvCommand<string | null>('GET', `${KEY_PREFIX}${key}`);
  return raw ? (JSON.parse(raw) as AttemptState) : null;
};

const writeAttemptToKv = async (key: string, state: AttemptState): Promise<void> => {
  await runKvCommand('SET', `${KEY_PREFIX}${key}`, JSON.stringify(state), 'PX', LOCK_MS + WINDOW_MS);
};

const deleteAttemptFromKv = async (key: string): Promise<void> => {
  await runKvCommand('DEL', `${KEY_PREFIX}${key}`);
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
  const key = buildKey(req, username);
  if (isProductionRuntime() && !hasKvConfig()) {
    throw new Error('Vercel KV is required for login rate limiting in production.');
  }
  if (hasKvConfig()) {
    const state = await readAttemptFromKv(key);
    if (!state?.lockedUntil || state.lockedUntil <= now) {
      return { limited: false, retryAfterSeconds: 0 };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
    return { limited: true, retryAfterSeconds };
  }

  const store = await readStoreFromFile();
  cleanupExpired(store, now);
  const state = store.attempts[key];
  if (!state?.lockedUntil || state.lockedUntil <= now) {
    await writeStoreToFile(store);
    return { limited: false, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
  await writeStoreToFile(store);
  return { limited: true, retryAfterSeconds };
};

export const recordLoginFailure = async (req: any, username: string): Promise<void> => {
  const now = Date.now();
  const key = buildKey(req, username);
  if (hasKvConfig()) {
    const current = await readAttemptFromKv(key);
    if (!current || current.firstFailedAt + WINDOW_MS <= now) {
      await writeAttemptToKv(key, {
        firstFailedAt: now,
        failedCount: 1,
      });
      return;
    }

    const nextFailedCount = current.failedCount + 1;
    await writeAttemptToKv(key, {
      ...current,
      failedCount: nextFailedCount,
      lockedUntil: nextFailedCount >= MAX_ATTEMPTS ? now + LOCK_MS : current.lockedUntil,
    });
    return;
  }

  const store = await readStoreFromFile();
  cleanupExpired(store, now);
  const current = store.attempts[key];
  if (!current || current.firstFailedAt + WINDOW_MS <= now) {
    store.attempts[key] = {
      firstFailedAt: now,
      failedCount: 1,
    };
    await writeStoreToFile(store);
    return;
  }

  const nextFailedCount = current.failedCount + 1;
  store.attempts[key] = {
    ...current,
    failedCount: nextFailedCount,
    lockedUntil: nextFailedCount >= MAX_ATTEMPTS ? now + LOCK_MS : current.lockedUntil,
  };
  await writeStoreToFile(store);
};

export const clearLoginFailures = async (req: any, username: string): Promise<void> => {
  const key = buildKey(req, username);
  if (hasKvConfig()) {
    await deleteAttemptFromKv(key);
    return;
  }

  const store = await readStoreFromFile();
  if (store.attempts[key]) {
    delete store.attempts[key];
    await writeStoreToFile(store);
  }
};
