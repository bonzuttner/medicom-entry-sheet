import { clearSessionCookie, getSessionUserId, sendError } from './http.js';
import { User } from './types.js';
import * as UserRepository from './repositories/users.js';

export const getCurrentUser = async (req: any): Promise<User | null> => {
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) return null;
  return await UserRepository.findById(sessionUserId);
};

export const requireUser = async (req: any, res: any): Promise<User | null> => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    // Clear stale/invalid session cookie (e.g. user ID changed after migration)
    clearSessionCookie(res);
    sendError(res, 401, 'Unauthorized');
    return null;
  }
  return currentUser;
};

export const isAdmin = (user: User): boolean => user.role === 'ADMIN';

export const canAccessManufacturer = (user: User, manufacturerName: string): boolean =>
  isAdmin(user) || user.manufacturerName === manufacturerName;
