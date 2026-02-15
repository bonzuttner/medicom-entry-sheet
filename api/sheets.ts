import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, sendJson } from './_lib/http.js';
import { pruneSheetsByRetention } from './_lib/retention.js';
import { readStore, writeStore } from './_lib/store.js';

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
