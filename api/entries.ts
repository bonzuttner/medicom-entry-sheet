import { getMethod, sendError } from './_lib/http.js';

// Deprecated endpoint. Kept only to avoid unexpected 404s for stale clients.
export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    sendError(res, 405, 'Method not allowed');
    return;
  }
  sendError(res, 410, 'Deprecated endpoint. Use /api/sheets.');
}
