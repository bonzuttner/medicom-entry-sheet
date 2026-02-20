import { createInitialStoreData } from './initialData.js';
import { hasLegacyEmbeddedMedia, migrateStoreMedia } from './media.js';
import { hashPassword, isHashedPassword } from './password.js';
import { isProductionRuntime } from './runtime.js';
import { MasterData, StoreData } from './types.js';
import { promises as fs } from 'fs';
import path from 'path';

const STORE_PATH = path.join('/tmp', 'pharmapop-api-store.json');

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
        'Persistent store is not initialized. For production, migrate data to PostgreSQL first.'
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

export const readStore = async (): Promise<StoreData> => {
  const parsed = await readStoreFromFile();
  const defaults = createInitialStoreData();

  let changed = false;

  // Password migration: Only run in non-production environments
  // Production should use /api/admin/migrate-to-postgres instead
  if (!isProductionRuntime()) {
    const migratedUsers = parsed.users.map((user) => {
      if (!user.password || isHashedPassword(user.password)) {
        return user;
      }
      changed = true;
      console.warn(`[Migration] Hashing password for user: ${user.username}`);
      return {
        ...user,
        password: hashPassword(user.password),
      };
    });

    if (changed) {
      parsed.users = migratedUsers;
    }
  }

  // Master data normalization: Always run for backward compatibility
  const normalizedMaster = normalizeMasterData(parsed.master || {}, defaults.master);
  if (JSON.stringify(parsed.master) !== JSON.stringify(normalizedMaster)) {
    parsed.master = normalizedMaster;
    changed = true;
  }

  // Media migration: Only run in non-production environments
  if (!isProductionRuntime() && hasLegacyEmbeddedMedia(parsed.sheets)) {
    try {
      console.warn('[Migration] Migrating legacy embedded media to Vercel Blob');
      parsed.sheets = await migrateStoreMedia(parsed.sheets);
      changed = true;
    } catch (error) {
      console.warn('Skipping media migration:', error);
    }
  }

  if (changed) {
    await writeStore(parsed);
  }

  return parsed;
};

export const writeStore = async (data: StoreData): Promise<void> => {
  await writeStoreToFile(data);
};
