import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, sendJson } from './_lib/http.js';
import * as SheetRepository from './_lib/repositories/sheets.js';
import * as UserRepository from './_lib/repositories/users.js';

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  // Get sheets based on user role
  let sheets;
  if (isAdmin(currentUser)) {
    sheets = await SheetRepository.findAll();
  } else {
    const manufacturerId = await UserRepository.getManufacturerIdByUserId(currentUser.id);
    sheets = manufacturerId ? await SheetRepository.findByManufacturerId(manufacturerId) : [];
  }

  sendJson(res, 200, sheets);
}
