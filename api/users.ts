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
import { User } from './_lib/types.js';
import * as UserRepository from './_lib/repositories/users.js';

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
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (method === 'GET') {
    const users = isAdmin(currentUser)
      ? await UserRepository.findAll()
      : await UserRepository.findByManufacturerId(
          (await UserRepository.getManufacturerId(currentUser.manufacturerName)) || ''
        );
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
      const existingUser = await UserRepository.findById(incomingUser.id);
      const passwordError = validateIncomingPassword(incomingUser, existingUser || undefined);
      if (passwordError) {
        sendError(res, 400, passwordError);
        return;
      }
    }

    if (isAdmin(currentUser)) {
      // ADMIN: Can save all users
      const usersToSave = await Promise.all(
        incomingUsers.map(async (incomingUser) => {
          const existingUser = await UserRepository.findById(incomingUser.id);
          return {
            ...incomingUser,
            password: resolvePasswordForSave(incomingUser, existingUser || undefined),
          };
        })
      );

      const savedUsers = await UserRepository.upsertMany(usersToSave);
      sendJson(res, 200, savedUsers.map((u) => sanitizeUser(u)));
      return;
    }

    // STAFF: Can only save users in their manufacturer
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

    const usersToSave = await Promise.all(
      incomingUsers.map(async (incomingUser) => {
        const existingUser = await UserRepository.findById(incomingUser.id);
        return {
          ...incomingUser,
          password: resolvePasswordForSave(incomingUser, existingUser || undefined),
        };
      })
    );

    const savedUsers = await UserRepository.upsertMany(usersToSave);
    sendJson(res, 200, savedUsers.map((u) => sanitizeUser(u)));
    return;
  }

  methodNotAllowed(res);
}
