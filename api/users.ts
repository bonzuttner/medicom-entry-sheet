import { isAdmin, requireUser } from './_lib/auth.js';
import {
  getMethod,
  methodNotAllowed,
  sanitizeUser,
  sendError,
  sendJson,
} from './_lib/http.js';
import * as UserRepository from './_lib/repositories/users.js';

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (method === 'GET') {
    const users = isAdmin(currentUser)
      ? await UserRepository.findAll()
      : await UserRepository.findByManufacturerId(
          await UserRepository.getOrCreateManufacturerId(currentUser.manufacturerName)
        );
    sendJson(res, 200, users.map((u) => sanitizeUser(u)));
    return;
  }

  if (method === 'PUT') {
    sendError(res, 410, 'Bulk update is deprecated. Use /api/users/:id');
    return;
  }

  methodNotAllowed(res);
}
