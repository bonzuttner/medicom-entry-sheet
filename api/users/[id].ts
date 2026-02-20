import { isAdmin, requireUser } from '../_lib/auth.js';
import {
  getMethod,
  methodNotAllowed,
  readJsonBody,
  sanitizeUser,
  sendError,
  sendJson,
} from '../_lib/http.js';
import { hashPassword, isHashedPassword } from '../_lib/password.js';
import { User } from '../_lib/types.js';
import * as UserRepository from '../_lib/repositories/users.js';

interface PutUserBody {
  user?: User;
}

const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const getUserId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

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
  if (method !== 'PUT' && method !== 'DELETE') {
    methodNotAllowed(res);
    return;
  }

  const targetUserId = getUserId(req);
  if (!targetUserId) {
    sendError(res, 400, 'User id is required');
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (method === 'PUT') {
    const body = await readJsonBody<PutUserBody>(req);
    const incomingUser = body.user;
    if (!incomingUser) {
      sendError(res, 400, 'user is required');
      return;
    }

    const existingUser = await UserRepository.findById(targetUserId);

    if (!isAdmin(currentUser)) {
      const targetManufacturer = existingUser?.manufacturerName || incomingUser.manufacturerName;
      if (targetManufacturer !== currentUser.manufacturerName) {
        sendError(res, 403, 'You can only manage users in your manufacturer');
        return;
      }
      if (incomingUser.role === 'ADMIN') {
        sendError(res, 403, 'Only admins can manage admin users');
        return;
      }
    }

    const normalizedUser: User = {
      ...incomingUser,
      id: targetUserId,
      username: String(incomingUser.username || '').trim(),
      displayName: String(incomingUser.displayName || '').trim(),
      manufacturerName: isAdmin(currentUser)
        ? String(incomingUser.manufacturerName || '').trim()
        : currentUser.manufacturerName,
      email: String(incomingUser.email || '').trim(),
      phoneNumber: String(incomingUser.phoneNumber || '').trim(),
      role: isAdmin(currentUser) ? incomingUser.role : 'STAFF',
    };

    if (!normalizedUser.username || !normalizedUser.displayName || !normalizedUser.manufacturerName) {
      sendError(res, 400, 'username, displayName, manufacturerName are required');
      return;
    }

    const usernameTaken = await UserRepository.isUsernameTaken(
      normalizedUser.username,
      targetUserId
    );
    if (usernameTaken) {
      sendError(res, 400, 'Username is already taken');
      return;
    }

    const passwordError = validateIncomingPassword(normalizedUser, existingUser || undefined);
    if (passwordError) {
      sendError(res, 400, passwordError);
      return;
    }

    const userToSave: User = {
      ...normalizedUser,
      password: resolvePasswordForSave(normalizedUser, existingUser || undefined),
    };

    const savedUser = await UserRepository.upsert(userToSave);
    sendJson(res, 200, sanitizeUser(savedUser));
    return;
  }

  const targetUser = await UserRepository.findById(targetUserId);
  if (!targetUser) {
    sendError(res, 404, 'User not found');
    return;
  }

  if (!isAdmin(currentUser) && targetUser.manufacturerName !== currentUser.manufacturerName) {
    sendError(res, 403, 'You can only manage users in your manufacturer');
    return;
  }
  if (!isAdmin(currentUser) && targetUser.role === 'ADMIN') {
    sendError(res, 403, 'Only admins can manage admin users');
    return;
  }

  const deleted = await UserRepository.deleteById(targetUserId);
  if (!deleted) {
    sendError(res, 404, 'User not found');
    return;
  }
  sendJson(res, 200, { ok: true });
}
