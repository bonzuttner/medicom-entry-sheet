import { isAdmin, requireUser } from './_lib/auth.js';
import {
  getMethod,
  methodNotAllowed,
  readJsonBody,
  sanitizeUser,
  sendError,
  sendJson,
} from './_lib/http.js';
import { hashPassword, isHashedPassword } from './_lib/password.js';
import { readStore, writeStore } from './_lib/store.js';
import { User } from './_lib/types.js';

interface PutUsersBody {
  users?: User[];
}

const hasDuplicateUsernames = (users: User[]): boolean => {
  const seen = new Set<string>();
  for (const user of users) {
    if (seen.has(user.username)) return true;
    seen.add(user.username);
  }
  return false;
};

const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const validateIncomingPassword = (incomingUser: User, existingUser?: User): string | null => {
  const incomingPassword = incomingUser.password;
  if (!incomingPassword) {
    return existingUser ? null : 'Password is required for new users';
  }
  if (isHashedPassword(incomingPassword)) return null;
  return passwordRule.test(incomingPassword)
    ? null
    : 'Password must include uppercase, lowercase, number, symbol, and be at least 8 characters';
};

const resolvePasswordForSave = (incomingUser: User, existingUser?: User): string => {
  const incomingPassword = incomingUser.password;
  if (!incomingPassword) {
    if (existingUser?.password) return existingUser.password;
    return hashPassword('Password1!');
  }
  return isHashedPassword(incomingPassword)
    ? incomingPassword
    : hashPassword(incomingPassword);
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const store = await readStore();
  const currentUser = requireUser(req, res, store);
  if (!currentUser) return;

  if (method === 'GET') {
    const users = isAdmin(currentUser)
      ? store.users
      : store.users.filter((u) => u.manufacturerName === currentUser.manufacturerName);
    sendJson(res, 200, users.map((u) => sanitizeUser(u)));
    return;
  }

  if (method === 'PUT') {
    const body = await readJsonBody<PutUsersBody>(req);
    const incomingUsers = body.users;
    if (!Array.isArray(incomingUsers)) {
      sendError(res, 400, 'users array is required');
      return;
    }

    if (hasDuplicateUsernames(incomingUsers)) {
      sendError(res, 400, 'Duplicate usernames are not allowed');
      return;
    }

    for (const incomingUser of incomingUsers) {
      const existingUser = store.users.find((u) => u.id === incomingUser.id);
      const passwordError = validateIncomingPassword(incomingUser, existingUser);
      if (passwordError) {
        sendError(res, 400, passwordError);
        return;
      }
    }

    if (isAdmin(currentUser)) {
      store.users = incomingUsers.map((incomingUser) => {
        const existingUser = store.users.find((u) => u.id === incomingUser.id);
        return {
          ...incomingUser,
          password: resolvePasswordForSave(incomingUser, existingUser),
        };
      });
      await writeStore(store);
      sendJson(res, 200, store.users.map((u) => sanitizeUser(u)));
      return;
    }

    const hasCrossManufacturerData = incomingUsers.some(
      (u) => u.manufacturerName !== currentUser.manufacturerName
    );
    if (hasCrossManufacturerData) {
      sendError(res, 403, 'You can only manage users in your manufacturer');
      return;
    }

    const hasAdminMutation = incomingUsers.some((u) => u.role === 'ADMIN');
    if (hasAdminMutation) {
      sendError(res, 403, 'Only admins can manage admin users');
      return;
    }

    const otherManufacturerUsers = store.users.filter(
      (u) => u.manufacturerName !== currentUser.manufacturerName
    );
    const mergedManufacturerUsers = incomingUsers.map((incomingUser) => {
      const existingUser = store.users.find((u) => u.id === incomingUser.id);
      return {
        ...incomingUser,
        password: resolvePasswordForSave(incomingUser, existingUser),
      };
    });

    store.users = [...otherManufacturerUsers, ...mergedManufacturerUsers];
    await writeStore(store);

    sendJson(
      res,
      200,
      store.users
        .filter((u) => u.manufacturerName === currentUser.manufacturerName)
        .map((u) => sanitizeUser(u))
    );
    return;
  }

  methodNotAllowed(res);
}
