import * as db from '../db.js';
import { ReviewComment, UserRole } from '../types.js';

interface ReviewCommentRow {
  id: string;
  sheet_id: string;
  user_id: string;
  user_name_snapshot: string;
  user_role_snapshot: string;
  comment: string;
  created_at: Date;
}

export const getCommentsBySheetId = async (sheetId: string): Promise<ReviewComment[]> => {
  const result = await db.query<ReviewCommentRow>(
    `SELECT
      id,
      sheet_id,
      user_id,
      user_name_snapshot,
      user_role_snapshot,
      comment,
      created_at
    FROM sheet_review_comments
    WHERE sheet_id = $1
    ORDER BY created_at DESC`,
    [sheetId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sheetId: row.sheet_id,
    userId: row.user_id,
    userNameSnapshot: row.user_name_snapshot,
    userRoleSnapshot: row.user_role_snapshot as UserRole,
    comment: row.comment,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  }));
};

export const addComment = async (
  sheetId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  comment: string
): Promise<ReviewComment> => {
  const result = await db.query<ReviewCommentRow>(
    `INSERT INTO sheet_review_comments (
      sheet_id,
      user_id,
      user_name_snapshot,
      user_role_snapshot,
      comment
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      sheet_id,
      user_id,
      user_name_snapshot,
      user_role_snapshot,
      comment,
      created_at`,
    [sheetId, userId, userName, userRole, comment]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    sheetId: row.sheet_id,
    userId: row.user_id,
    userNameSnapshot: row.user_name_snapshot,
    userRoleSnapshot: row.user_role_snapshot as UserRole,
    comment: row.comment,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
};

export const deleteCommentsBySheetId = async (sheetId: string): Promise<void> => {
  await db.query(
    `DELETE FROM sheet_review_comments
    WHERE sheet_id = $1`,
    [sheetId]
  );
};
