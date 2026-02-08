import { promises as fs } from 'fs';
import path from 'path';
import { createInitialStoreData } from './initialData';
import { hashPassword, isHashedPassword } from './password';
import { MasterData, StoreData } from './types';

const STORE_PATH = path.join('/tmp', 'pharmapop-api-store.json');

const normalizeMasterData = (data: Partial<MasterData>, fallback: MasterData): MasterData => ({
  manufacturerNames: data.manufacturerNames ?? fallback.manufacturerNames,
  shelfNames: data.shelfNames ?? fallback.shelfNames,
  riskClassifications: data.riskClassifications ?? fallback.riskClassifications,
  specificIngredients: data.specificIngredients ?? fallback.specificIngredients,
});

const ensureStoreFile = async (): Promise<void> => {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await writeStore(createInitialStoreData());
  }
};

export const readStore = async (): Promise<StoreData> => {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as StoreData;
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

  if (changed) {
    await writeStore(parsed);
  }

  return parsed;
};

export const writeStore = async (data: StoreData): Promise<void> => {
  await fs.writeFile(STORE_PATH, JSON.stringify(data), 'utf8');
};
