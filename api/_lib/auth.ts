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

export const isRetailer = (user: User): boolean => user.role === 'RETAILER';

export const isStaff = (user: User): boolean => user.role === 'STAFF';

export const canAccessManufacturer = (user: User, manufacturerName: string): boolean =>
  isAdmin(user) || user.manufacturerName === manufacturerName;

export const canAccessManufacturerById = (user: User, manufacturerId: string): boolean => {
  if (isAdmin(user)) return true;
  if (isRetailer(user)) {
    return user.assignedManufacturerIds?.includes(manufacturerId) ?? false;
  }
  return user.manufacturerId === manufacturerId;
};

export const canReviewSheet = (user: User, manufacturerId: string): boolean => {
  if (isAdmin(user)) return true;
  if (isRetailer(user)) {
    return user.assignedManufacturerIds?.includes(manufacturerId) ?? false;
  }
  return false;
};

export const canModifySheet = (user: User, manufacturerId: string): boolean => {
  if (isAdmin(user)) return true;
  if (isStaff(user)) {
    return user.manufacturerId === manufacturerId;
  }
  return false;
};
