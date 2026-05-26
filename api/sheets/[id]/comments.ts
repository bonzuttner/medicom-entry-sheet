import { requireUser, canAccessManufacturerById } from '../../_lib/auth.js';
import { sendError, sendJson } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import * as ReviewCommentRepository from '../../_lib/repositories/reviewComments.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const sheetId = req.query.id as string;
  if (!sheetId) {
    sendError(res, 400, 'Sheet ID is required');
    return;
  }

  // シートの存在確認とメーカー取得
  const sheetRow = await db.queryOne<{
    id: string;
    manufacturer_id: string;
  }>(
    `SELECT id, manufacturer_id FROM entry_sheets WHERE id = $1`,
    [sheetId]
  );

  if (!sheetRow) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  // アクセス権限チェック
  if (!canAccessManufacturerById(user, sheetRow.manufacturer_id)) {
    sendError(res, 403, 'You do not have permission to view comments for this sheet');
    return;
  }

  try {
    const comments = await ReviewCommentRepository.getCommentsBySheetId(sheetId);
    sendJson(res, 200, { comments });
  } catch (error) {
    console.error('Failed to get comments:', error);
    sendError(res, 500, 'Failed to get comments');
  }
}
