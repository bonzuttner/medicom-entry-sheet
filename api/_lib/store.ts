import { createInitialStoreData } from './initialData.js';
import { hasKvConfig, runKvCommand } from './kv.js';
import { hasLegacyEmbeddedMedia, migrateStoreMedia } from './media.js';
import { hashPassword, isHashedPassword } from './password.js';
import { isProductionRuntime } from './runtime.js';
import { MasterData, StoreData } from './types.js';
import { promises as fs } from 'fs';
import path from 'path';

const STORE_PATH = path.join('/tmp', 'pharmapop-api-store.json');
const STORE_KEY = 'pharmapop:store:data';

const normalizeMasterData = (data: Partial<MasterData>, fallback: MasterData): MasterData => ({
  manufacturerNames: data.manufacturerNames ?? fallback.manufacturerNames,
  shelfNames: data.shelfNames ?? fallback.shelfNames,
  riskClassifications: data.riskClassifications ?? fallback.riskClassifications,
  specificIngredients: data.specificIngredients ?? fallback.specificIngredients,
});

const readStoreFromFile = async (): Promise<StoreData> => {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(raw) as StoreData;
  } catch {
    if (isProductionRuntime()) {
      throw new Error(
        'Persistent store is not initialized. For production, migrate data first and use Vercel KV.'
      );
    }
    const initial = createInitialStoreData();
    await fs.writeFile(STORE_PATH, JSON.stringify(initial), 'utf8');
    return initial;
  }
};

const writeStoreToFile = async (data: StoreData): Promise<void> => {
  await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf8');
};

const readStoreFromKv = async (): Promise<StoreData> => {
  const raw = await runKvCommand<string | null>('GET', STORE_KEY);
  if (!raw) {
    if (isProductionRuntime()) {
      throw new Error(
        'KV store is empty. For production, migrate data before enabling traffic.'
      );
    }
    const initial = createInitialStoreData();
    await runKvCommand('SET', STORE_KEY, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw) as StoreData;
};

const writeStoreToKv = async (data: StoreData): Promise<void> => {
  await runKvCommand('SET', STORE_KEY, JSON.stringify(data));
};

export const readStore = async (): Promise<StoreData> => {
  if (isProductionRuntime() && !hasKvConfig()) {
    throw new Error(
      'Vercel KV is required when APP_RUNTIME_ENV=production.'
    );
  }
  const parsed = hasKvConfig() ? await readStoreFromKv() : await readStoreFromFile();
  const defaults = createInitialStoreData();

  let changed = false;
  const migratedUsers = parsed.users.map((user) => {
    if (!user.password || isHashedPassword(user.password)) {
      return user;
    }
    changed = true;
    return {
      ...user,
      password: hashPassword(user.password),
    };
  });

  if (changed) {
    parsed.users = migratedUsers;
  }

  const normalizedMaster = normalizeMasterData(parsed.master || {}, defaults.master);
  if (JSON.stringify(parsed.master) !== JSON.stringify(normalizedMaster)) {
    parsed.master = normalizedMaster;
    changed = true;
  }

  if (hasLegacyEmbeddedMedia(parsed.sheets)) {
    try {
      parsed.sheets = await migrateStoreMedia(parsed.sheets);
      changed = true;
    } catch (error) {
      if (isProductionRuntime()) {
        throw error;
      }
      console.warn('Skipping media migration in non-production runtime:', error);
    }
  }

  if (changed) {
    await writeStore(parsed);
  }

  return parsed;
};

export const writeStore = async (data: StoreData): Promise<void> => {
  if (hasKvConfig()) {
    await writeStoreToKv(data);
    return;
  }
  await writeStoreToFile(data);
};
