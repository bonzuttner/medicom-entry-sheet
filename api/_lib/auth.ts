import { getSessionUserId, sendError } from './http.js';
import { StoreData, User } from './types.js';

export const getCurrentUser = (req: any, store: StoreData): User | null => {
  const sessionUserId = getSessionUserId(req);
  if (!sessionUserId) return null;
  return store.users.find((u) => u.id === sessionUserId) || null;
};

export const requireUser = (req: any, res: any, store: StoreData): User | null => {
  const currentUser = getCurrentUser(req, store);
  if (!currentUser) {
    sendError(res, 401, 'Unauthorized');
    return null;
  }
  return currentUser;
};

export const isAdmin = (user: User): boolean => user.role === 'ADMIN';

export const canAccessManufacturer = (user: User, manufacturerName: string): boolean =>
  isAdmin(user) || user.manufacturerName === manufacturerName;
