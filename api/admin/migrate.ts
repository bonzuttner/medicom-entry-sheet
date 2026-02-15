import { isAdmin, requireUser } from '../_lib/auth';
import {
  getMethod,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
} from '../_lib/http';
import { normalizeSheetMedia } from '../_lib/media';
import { hashPassword, isHashedPassword } from '../_lib/password';
import { readStore, writeStore } from '../_lib/store';
import { StoreData, User } from '../_lib/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeUsers = (users: User[]): User[] =>
  users.map((user) => {
    if (!user.password || isHashedPassword(user.password)) {
      return user;
    }
    return { ...user, password: hashPassword(user.password) };
  });

const isValidStoreData = (data: unknown): data is StoreData => {
  if (!isObject(data)) return false;
  return Array.isArray(data.users) && Array.isArray(data.sheets) && isObject(data.master);
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  if (method !== 'GET' && method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const store = await readStore();
  const currentUser = requireUser(req, res, store);
  if (!currentUser) return;
  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can migrate data');
    return;
  }

  if (method === 'GET') {
    sendJson(res, 200, store);
    return;
  }

  const body = await readJsonBody<{ data?: StoreData }>(req);
  if (!isValidStoreData(body.data)) {
    sendError(res, 400, 'data with users/sheets/master is required');
    return;
  }

  const nextStore: StoreData = {
    users: normalizeUsers(body.data.users),
    sheets: [],
    master: body.data.master,
  };

  try {
    nextStore.sheets = await Promise.all(
      body.data.sheets.map((sheet) =>
        normalizeSheetMedia(sheet, `pharmapop/migrate/${sheet.id}`)
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid migration media payload';
    sendError(res, 400, message);
    return;
  }

  await writeStore(nextStore);
  sendJson(res, 200, { ok: true, users: nextStore.users.length, sheets: nextStore.sheets.length });
}
