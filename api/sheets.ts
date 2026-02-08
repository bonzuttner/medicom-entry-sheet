import { isAdmin, requireUser } from './_lib/auth';
import { getMethod, methodNotAllowed, sendJson } from './_lib/http';
import { pruneSheetsByRetention } from './_lib/retention';
import { readStore, writeStore } from './_lib/store';

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const store = await readStore();
  const prunedSheets = pruneSheetsByRetention(store.sheets);
  if (prunedSheets.length !== store.sheets.length) {
    store.sheets = prunedSheets;
    await writeStore(store);
  }
  const currentUser = requireUser(req, res, store);
  if (!currentUser) return;

  const sheets = isAdmin(currentUser)
    ? store.sheets
    : store.sheets.filter((sheet) => sheet.manufacturerName === currentUser.manufacturerName);

  sendJson(res, 200, sheets);
}
