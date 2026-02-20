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

  // Prune old sheets (retention policy)
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
  await SheetRepository.pruneByRetention(cutoffDate);

  // Get sheets based on user role
  const sheets = isAdmin(currentUser)
    ? await SheetRepository.findAll()
    : await SheetRepository.findByManufacturerId(
        await UserRepository.getOrCreateManufacturerId(currentUser.manufacturerName)
      );

  sendJson(res, 200, sheets);
}
