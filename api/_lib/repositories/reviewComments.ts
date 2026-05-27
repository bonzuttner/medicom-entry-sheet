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

let ensureReviewCommentsTablePromise: Promise<void> | null = null;

const ensureReviewCommentsTable = async (): Promise<void> => {
  if (!ensureReviewCommentsTablePromise) {
    ensureReviewCommentsTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS sheet_review_comments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sheet_id UUID NOT NULL REFERENCES entry_sheets(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_name_snapshot VARCHAR(200) NOT NULL,
          user_role_snapshot VARCHAR(20) NOT NULL,
          comment TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        `
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_review_comments_sheet
         ON sheet_review_comments(sheet_id)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_review_comments_created
         ON sheet_review_comments(sheet_id, created_at DESC)`
      );
    })().catch((error) => {
      ensureReviewCommentsTablePromise = null;
      throw error;
    });
  }
  await ensureReviewCommentsTablePromise;
};

export const getCommentsBySheetId = async (sheetId: string): Promise<ReviewComment[]> => {
  await ensureReviewCommentsTable();
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
  await ensureReviewCommentsTable();
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
  await ensureReviewCommentsTable();
  await db.query(
    `DELETE FROM sheet_review_comments
    WHERE sheet_id = $1`,
    [sheetId]
  );
};
