import { requireUser, canReviewSheet } from '../../_lib/auth.js';
import { sendError, sendJson } from '../../_lib/http.js';
import * as db from '../../_lib/db.js';
import * as ReviewCommentRepository from '../../_lib/repositories/reviewComments.js';
import * as SheetRepository from '../../_lib/repositories/sheets.js';
import { EntryStatus } from '../../_lib/types.js';

type ReviewAction = 'approve' | 'request_revision';

interface ReviewRequest {
  action: ReviewAction;
  comment?: string;
}

const VALID_ACTIONS: ReviewAction[] = ['approve', 'request_revision'];

export default async function handler(req: any, res: any) {
  if (req.method !== 'PUT') {
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

  await SheetRepository.ensureSheetWorkflowInfrastructure();

  // シートの存在確認とメーカー取得
  const sheetRow = await db.queryOne<{
    id: string;
    manufacturer_id: string;
    status: string;
    entry_status: string;
    version: number;
  }>(
    `SELECT id, manufacturer_id, status, entry_status, version FROM entry_sheets WHERE id = $1`,
    [sheetId]
  );

  if (!sheetRow) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  // レビュー権限チェック
  if (!canReviewSheet(user, sheetRow.manufacturer_id)) {
    sendError(res, 403, 'You do not have permission to review this sheet');
    return;
  }

  // 完了状態のシートのみレビュー可能
  const currentStatus = sheetRow.entry_status || sheetRow.status;
  if (currentStatus !== 'completed' && currentStatus !== 'completed_no_image') {
    sendError(res, 400, 'Only completed sheets can be reviewed');
    return;
  }

  const body = req.body as ReviewRequest;
  if (!body || !VALID_ACTIONS.includes(body.action)) {
    sendError(res, 400, 'Invalid action. Must be "approve" or "request_revision"');
    return;
  }

  // 修正依頼の場合はコメント必須
  if (body.action === 'request_revision' && (!body.comment || body.comment.trim().length === 0)) {
    sendError(res, 400, 'Comment is required for revision request');
    return;
  }

  try {
    let newStatus: EntryStatus;
    if (body.action === 'approve') {
      newStatus = 'approved';
    } else {
      newStatus = 'revision_requested';
    }

    // ステータス更新
    await db.query(
      `UPDATE entry_sheets
       SET status = $1, entry_status = $1, version = version + 1, updated_at = NOW()
       WHERE id = $2`,
      [newStatus, sheetId]
    );

    // 修正依頼の場合はコメント追加
    if (body.action === 'request_revision' && body.comment) {
      await ReviewCommentRepository.addComment(
        sheetId,
        user.id,
        user.displayName,
        user.role,
        body.comment.trim()
      );
    }

    // 変更履歴を記録
    const summaryText = body.action === 'approve'
      ? '承認しました'
      : `修正依頼: ${body.comment?.trim() || ''}`;
    await db.query(
      `INSERT INTO entry_sheet_revisions (sheet_id, changed_by_user_id, changed_by_name_snapshot, summary)
       VALUES ($1, $2, $3, $4)`,
      [sheetId, user.id, user.displayName, summaryText]
    );

    // 更新後のシート情報を取得
    const updatedSheet = await db.queryOne<{
      id: string;
      status: string;
      entry_status: string;
      version: number;
      updated_at: Date;
    }>(
      `SELECT id, status, entry_status, version, updated_at FROM entry_sheets WHERE id = $1`,
      [sheetId]
    );

    sendJson(res, 200, {
      ok: true,
      sheet: {
        id: updatedSheet?.id,
        status: updatedSheet?.status,
        entryStatus: updatedSheet?.entry_status,
        version: updatedSheet?.version,
        updatedAt: updatedSheet?.updated_at?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to review sheet:', error);
    sendError(res, 500, 'Failed to review sheet');
  }
}
