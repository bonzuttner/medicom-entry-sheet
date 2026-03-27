import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, sendJson } from './_lib/http.js';
import * as SheetRepository from './_lib/repositories/sheets.js';
import * as UserRepository from './_lib/repositories/users.js';
import { EntrySheet } from './_lib/types.js';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const parsePositiveInt = (value: unknown): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
};

const stripAdminMemo = (sheet: EntrySheet): EntrySheet => ({
  ...sheet,
  adminMemo: undefined,
});

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  await SheetRepository.pruneRetentionIfDue();

  const hasPagingQuery = req.query?.limit !== undefined || req.query?.offset !== undefined;
  const requestedLimit = parsePositiveInt(req.query?.limit);
  const requestedOffset = parsePositiveInt(req.query?.offset);
  const pageSize = Math.min(
    requestedLimit ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const pageOffset = requestedOffset ?? 0;

  // Get sheets based on user role
  let sheets;
  let totalCount = 0;
  if (isAdmin(currentUser)) {
    totalCount = await SheetRepository.countAll();
    sheets = hasPagingQuery
      ? await SheetRepository.findAll(pageSize + 1, pageOffset)
      : await SheetRepository.findAll();
  } else {
    const manufacturerId = await UserRepository.getManufacturerIdByUserId(currentUser.id);
    totalCount = manufacturerId ? await SheetRepository.countByManufacturerId(manufacturerId) : 0;
    sheets = manufacturerId
      ? hasPagingQuery
        ? await SheetRepository.findByManufacturerId(manufacturerId, pageSize + 1, pageOffset)
        : await SheetRepository.findByManufacturerId(manufacturerId)
      : [];
  }

  if (hasPagingQuery) {
    const hasMore = sheets.length > pageSize;
    const items = hasMore ? sheets.slice(0, pageSize) : sheets;
    const responseItems = isAdmin(currentUser) ? items : items.map(stripAdminMemo);
    sendJson(res, 200, { items: responseItems, hasMore, totalCount });
    return;
  }

  sendJson(res, 200, isAdmin(currentUser) ? sheets : sheets.map(stripAdminMemo));
}
