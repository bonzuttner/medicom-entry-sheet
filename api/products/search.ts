import { isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, sendError, sendJson } from '../_lib/http.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';
import * as UserRepository from '../_lib/repositories/users.js';

const parseLimit = (value: unknown): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return 30;
  return Math.min(num, 100);
};

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  await SheetRepository.pruneRetentionIfDue();

  const query = String(Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q || '').trim();
  const requestedManufacturerName = String(
    Array.isArray(req.query?.manufacturerName)
      ? req.query.manufacturerName[0]
      : req.query?.manufacturerName || ''
  ).trim();
  const limit = parseLimit(req.query?.limit);

  const resolvedManufacturerId = isAdmin(currentUser)
    ? requestedManufacturerName
      ? await UserRepository.getManufacturerId(requestedManufacturerName)
      : await UserRepository.getManufacturerIdByUserId(currentUser.id)
    : await UserRepository.getManufacturerIdByUserId(currentUser.id);

  if (!resolvedManufacturerId) {
    sendError(res, 400, 'Manufacturer is required');
    return;
  }

  const products = await SheetRepository.searchProductsByManufacturerId(
    resolvedManufacturerId,
    query,
    limit
  );
  sendJson(res, 200, products);
}
