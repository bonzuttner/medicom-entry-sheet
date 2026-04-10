import * as db from '../db.js';
import { getCreativeRetentionCutoff, getRetentionConfig } from '../retention.js';
import { Creative, CreativeLinkedSheet } from '../types.js';
import * as SheetRepository from './sheets.js';
import * as UserRepository from './users.js';

interface CreativeRow {
  id: string;
  version: number;
  manufacturer_name: string;
  creator_id: string | null;
  creator_name: string | null;
  name: string;
  image_url: string;
  memo: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CreativeLinkedSheetRow {
  creative_id: string;
  sheet_id: string;
  sheet_code: string | null;
  title: string;
  manufacturer_name: string;
  shelf_name: string | null;
  case_name: string | null;
}

interface CreativeWorkflowSheetRow {
  id: string;
  manufacturer_name: string;
  status: string;
  entry_status: string | null;
  creative_status: string | null;
}

let ensureCreativeTablesPromise: Promise<void> | null = null;
let pruneRetentionIfDuePromise: Promise<{ deletedCreatives: number }> | null = null;
let lastCreativeRetentionRunAt = 0;

const ensureCreativeTables = async (): Promise<void> => {
  if (!ensureCreativeTablesPromise) {
    ensureCreativeTablesPromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS creatives (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          version INTEGER NOT NULL DEFAULT 1,
          manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
          creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
          creator_name_snapshot VARCHAR(200),
          name VARCHAR(500) NOT NULL,
          image_url TEXT NOT NULL,
          memo TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        `
      );
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS creative_entry_sheets (
          creative_id UUID NOT NULL REFERENCES creatives(id) ON DELETE CASCADE,
          sheet_id UUID NOT NULL REFERENCES entry_sheets(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (creative_id, sheet_id),
          UNIQUE (sheet_id)
        )
        `
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_creatives_manufacturer ON creatives(manufacturer_id)`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_creatives_updated_at ON creatives(updated_at DESC)`
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_creatives_manufacturer_updated_at
        ON creatives(manufacturer_id, updated_at DESC)
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_creative_entry_sheets_creative
        ON creative_entry_sheets(creative_id)
        `
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creative_name_snapshot VARCHAR(500)`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creative_image_url_snapshot TEXT`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creative_updated_at_snapshot TIMESTAMP`
      );
    })().catch((error) => {
      ensureCreativeTablesPromise = null;
      throw error;
    });
  }
  await ensureCreativeTablesPromise;
};

const rowToLinkedSheet = (row: CreativeLinkedSheetRow): CreativeLinkedSheet => ({
  id: row.sheet_id,
  sheetCode: row.sheet_code || undefined,
  title: row.title,
  manufacturerName: row.manufacturer_name,
  shelfName: row.shelf_name || '',
  caseName: row.case_name || '',
});

const rowToCreative = (
  row: CreativeRow,
  linkedSheets: CreativeLinkedSheet[]
): Creative => ({
  id: row.id,
  version: row.version,
  manufacturerName: row.manufacturer_name,
  creatorId: row.creator_id || '',
  creatorName: row.creator_name || '',
  name: row.name,
  imageUrl: row.image_url,
  memo: row.memo || undefined,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
  linkedSheets,
});

const listLinkedSheets = async (creativeIds: string[]): Promise<Map<string, CreativeLinkedSheet[]>> => {
  if (creativeIds.length === 0) return new Map();
  const result = await db.query<CreativeLinkedSheetRow>(
    `
    SELECT
      ces.creative_id,
      es.id AS sheet_id,
      es.sheet_code,
      es.title,
      m.name AS manufacturer_name,
      es.shelf_name,
      es.case_name
    FROM creative_entry_sheets ces
    JOIN entry_sheets es ON es.id = ces.sheet_id
    JOIN manufacturers m ON m.id = es.manufacturer_id
    WHERE ces.creative_id = ANY($1)
    ORDER BY es.updated_at DESC, es.id ASC
    `,
    [creativeIds]
  );
  const map = new Map<string, CreativeLinkedSheet[]>();
  for (const row of result.rows) {
    const current = map.get(row.creative_id) || [];
    current.push(rowToLinkedSheet(row));
    map.set(row.creative_id, current);
  }
  return map;
};

const normalizeEntryStatus = (status: string, entryStatus: string | null): 'draft' | 'completed' | 'completed_no_image' => {
  if (entryStatus === 'completed') return 'completed';
  if (entryStatus === 'completed_no_image') return 'completed_no_image';
  if (status === 'completed') return 'completed';
  if (status === 'completed_no_image') return 'completed_no_image';
  return 'draft';
};

const normalizeCreativeStatus = (
  creativeStatus: string | null
): 'none' | 'in_progress' | 'confirmation_pending' | 'returned' | 'approved' => {
  if (creativeStatus === 'in_progress') return 'in_progress';
  if (creativeStatus === 'confirmation_pending') return 'confirmation_pending';
  if (creativeStatus === 'returned') return 'returned';
  if (creativeStatus === 'approved') return 'approved';
  return 'none';
};

const canModifyCreativeLinkage = (row: Pick<CreativeWorkflowSheetRow, 'status' | 'entry_status' | 'creative_status'>): boolean =>
  normalizeEntryStatus(row.status, row.entry_status) !== 'draft' &&
  (normalizeCreativeStatus(row.creative_status) === 'none' ||
    normalizeCreativeStatus(row.creative_status) === 'in_progress');

const assertWorkflowEditableSheets = async (sheetIds: string[]): Promise<void> => {
  if (sheetIds.length === 0) return;

  const result = await db.query<CreativeWorkflowSheetRow>(
    `
    SELECT es.id, m.name AS manufacturer_name, es.status, es.entry_status, es.creative_status
    FROM entry_sheets es
    JOIN manufacturers m ON m.id = es.manufacturer_id
    WHERE es.id = ANY($1)
    `,
    [sheetIds]
  );

  if (result.rows.length !== sheetIds.length) {
    throw new Error('SHEET_NOT_FOUND');
  }
  if (result.rows.some((row) => !canModifyCreativeLinkage(row))) {
    throw new Error('SHEET_WORKFLOW_LOCKED');
  }
};

const assertLinkableSheets = async (sheetIds: string[], creativeId: string): Promise<void> => {
  if (sheetIds.length === 0) return;

  const result = await db.query<CreativeWorkflowSheetRow>(
    `
    SELECT es.id, m.name AS manufacturer_name, es.status, es.entry_status, es.creative_status
    FROM entry_sheets es
    JOIN manufacturers m ON m.id = es.manufacturer_id
    WHERE es.id = ANY($1)
    `,
    [sheetIds]
  );

  if (result.rows.length !== sheetIds.length) {
    throw new Error('SHEET_NOT_FOUND');
  }
  if (result.rows.some((row) => !canModifyCreativeLinkage(row))) {
    throw new Error('SHEET_WORKFLOW_LOCKED');
  }

  const linked = await db.query<{ sheet_id: string }>(
    `
    SELECT sheet_id
    FROM creative_entry_sheets
    WHERE sheet_id = ANY($1) AND creative_id <> $2
    FOR UPDATE
    `,
    [sheetIds, creativeId]
  );

  if (linked.rows.length > 0) {
    throw new Error('SHEET_ALREADY_LINKED');
  }
};

export const findAll = async (): Promise<Creative[]> => {
  await ensureCreativeTables();
  const result = await db.query<CreativeRow>(
    `
    SELECT
      c.id,
      c.version,
      m.name AS manufacturer_name,
      c.creator_id,
      COALESCE(c.creator_name_snapshot, u.display_name) AS creator_name,
      c.name,
      c.image_url,
      c.memo,
      c.created_at,
      c.updated_at
    FROM creatives c
    JOIN manufacturers m ON m.id = c.manufacturer_id
    LEFT JOIN users u ON u.id = c.creator_id
    ORDER BY c.updated_at DESC, c.id DESC
    `
  );
  const linkedSheetsByCreativeId = await listLinkedSheets(result.rows.map((row) => row.id));
  return result.rows.map((row) => rowToCreative(row, linkedSheetsByCreativeId.get(row.id) || []));
};

export const findById = async (creativeId: string): Promise<Creative | null> => {
  await ensureCreativeTables();
  const row = await db.queryOne<CreativeRow>(
    `
    SELECT
      c.id,
      c.version,
      m.name AS manufacturer_name,
      c.creator_id,
      COALESCE(c.creator_name_snapshot, u.display_name) AS creator_name,
      c.name,
      c.image_url,
      c.memo,
      c.created_at,
      c.updated_at
    FROM creatives c
    JOIN manufacturers m ON m.id = c.manufacturer_id
    LEFT JOIN users u ON u.id = c.creator_id
    WHERE c.id = $1
    `,
    [creativeId]
  );

  if (!row) return null;
  const linkedSheets = await listLinkedSheets([creativeId]);
  return rowToCreative(row, linkedSheets.get(creativeId) || []);
};

export const findBySheetId = async (sheetId: string): Promise<Creative | null> => {
  await ensureCreativeTables();
  const row = await db.queryOne<CreativeRow>(
    `
    SELECT
      c.id,
      c.version,
      m.name AS manufacturer_name,
      c.creator_id,
      COALESCE(c.creator_name_snapshot, u.display_name) AS creator_name,
      c.name,
      c.image_url,
      c.memo,
      c.created_at,
      c.updated_at
    FROM creatives c
    JOIN creative_entry_sheets ces ON ces.creative_id = c.id
    JOIN manufacturers m ON m.id = c.manufacturer_id
    LEFT JOIN users u ON u.id = c.creator_id
    WHERE ces.sheet_id = $1
    `,
    [sheetId]
  );
  if (!row) return null;
  const linkedSheets = await listLinkedSheets([row.id]);
  return rowToCreative(row, linkedSheets.get(row.id) || []);
};

export const upsert = async (
  creative: Creative,
  options?: { expectedVersion?: number; forceOverwrite?: boolean }
): Promise<Creative> => {
  await ensureCreativeTables();
  return db.transaction(async () => {
    const normalizedCreative: Creative = {
      ...creative,
      version:
        Number.isInteger(Number(creative.version)) && Number(creative.version) > 0
          ? Number(creative.version)
          : 1,
      manufacturerName: String(creative.manufacturerName || '').trim(),
      creatorId: String(creative.creatorId || '').trim(),
      creatorName: String(creative.creatorName || '').trim(),
      name: String(creative.name || '').trim(),
      imageUrl: String(creative.imageUrl || '').trim(),
      memo: String(creative.memo || '').trim() || undefined,
      linkedSheets: Array.isArray(creative.linkedSheets) ? creative.linkedSheets : [],
      createdAt: creative.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!normalizedCreative.name || !normalizedCreative.imageUrl || !normalizedCreative.manufacturerName) {
      throw new Error('CREATIVE_REQUIRED_FIELDS');
    }

    const manufacturerId = await UserRepository.getManufacturerId(normalizedCreative.manufacturerName);
    if (!manufacturerId) {
      throw new Error('MANUFACTURER_NOT_FOUND');
    }

    const linkedSheetIds = [...new Set(normalizedCreative.linkedSheets.map((sheet) => sheet.id).filter(Boolean))];
    const existingLinkedRows = await db.query<{ sheet_id: string }>(
      `SELECT sheet_id FROM creative_entry_sheets WHERE creative_id = $1 FOR UPDATE`,
      [normalizedCreative.id]
    );
    const previousLinkedSheetIds = existingLinkedRows.rows.map((row) => row.sheet_id);
    const touchedSheetIds = [...new Set([...previousLinkedSheetIds, ...linkedSheetIds])];
    await assertWorkflowEditableSheets(touchedSheetIds);
    await assertLinkableSheets(linkedSheetIds, normalizedCreative.id);

    const existing = await db.queryOne<{ version: number }>(
      `SELECT version FROM creatives WHERE id = $1 FOR UPDATE`,
      [normalizedCreative.id]
    );

    const expectedVersion =
      Number.isInteger(Number(options?.expectedVersion)) && Number(options?.expectedVersion) > 0
        ? Number(options?.expectedVersion)
        : undefined;

    if (
      existing?.version !== undefined &&
      expectedVersion !== undefined &&
      expectedVersion !== existing.version &&
      options?.forceOverwrite !== true
    ) {
      throw new Error('VERSION_CONFLICT');
    }

    const nextVersion =
      existing?.version !== undefined ? existing.version + 1 : normalizedCreative.version;

    await db.query(
      `
      INSERT INTO creatives (
        id, version, manufacturer_id, creator_id, creator_name_snapshot,
        name, image_url, memo, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        version = EXCLUDED.version,
        manufacturer_id = EXCLUDED.manufacturer_id,
        creator_id = EXCLUDED.creator_id,
        creator_name_snapshot = EXCLUDED.creator_name_snapshot,
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        memo = EXCLUDED.memo,
        updated_at = EXCLUDED.updated_at
      `,
      [
        normalizedCreative.id,
        nextVersion,
        manufacturerId,
        normalizedCreative.creatorId || null,
        normalizedCreative.creatorName || null,
        normalizedCreative.name,
        normalizedCreative.imageUrl,
        normalizedCreative.memo || null,
        normalizedCreative.createdAt,
        normalizedCreative.updatedAt,
      ]
    );

    await db.query(`DELETE FROM creative_entry_sheets WHERE creative_id = $1`, [normalizedCreative.id]);
    if (linkedSheetIds.length > 0) {
      await db.query(
        `
        INSERT INTO creative_entry_sheets (creative_id, sheet_id)
        SELECT $1, sheet_id
        FROM unnest($2::uuid[]) AS items(sheet_id)
        `,
        [normalizedCreative.id, linkedSheetIds]
      );
    }

    const affectedSheetIds = touchedSheetIds;
    if (affectedSheetIds.length > 0) {
      await db.query(
        `
        UPDATE entry_sheets es
        SET
          creative_name_snapshot = CASE
            WHEN EXISTS (
              SELECT 1 FROM creative_entry_sheets ces WHERE ces.sheet_id = es.id
            ) THEN (
              SELECT c.name
              FROM creative_entry_sheets ces
              JOIN creatives c ON c.id = ces.creative_id
              WHERE ces.sheet_id = es.id
              LIMIT 1
            )
            ELSE NULL
          END,
          creative_image_url_snapshot = CASE
            WHEN EXISTS (
              SELECT 1 FROM creative_entry_sheets ces WHERE ces.sheet_id = es.id
            ) THEN (
              SELECT c.image_url
              FROM creative_entry_sheets ces
              JOIN creatives c ON c.id = ces.creative_id
              WHERE ces.sheet_id = es.id
              LIMIT 1
            )
            ELSE NULL
          END,
          creative_updated_at_snapshot = CASE
            WHEN EXISTS (
              SELECT 1 FROM creative_entry_sheets ces WHERE ces.sheet_id = es.id
            ) THEN (
              SELECT c.updated_at
              FROM creative_entry_sheets ces
              JOIN creatives c ON c.id = ces.creative_id
              WHERE ces.sheet_id = es.id
              LIMIT 1
            )
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE es.id = ANY($1)
        `,
        [affectedSheetIds]
      );
    }

    const saved = await findById(normalizedCreative.id);
    if (!saved) {
      throw new Error('CREATIVE_RELOAD_FAILED');
    }
    return saved;
  });
};

export const deleteById = async (creativeId: string): Promise<boolean> => {
  await ensureCreativeTables();
  return db.transaction(async () => {
    const linkedRow = await db.queryOne<{ sheet_id: string }>(
      `SELECT sheet_id FROM creative_entry_sheets WHERE creative_id = $1 LIMIT 1 FOR UPDATE`,
      [creativeId]
    );
    if (linkedRow) {
      throw new Error('CREATIVE_STILL_LINKED');
    }
    const result = await db.query(`DELETE FROM creatives WHERE id = $1`, [creativeId]);
    return result.rowCount > 0;
  });
};

export const relinkSheetToCreative = async (
  sheetId: string,
  targetCreativeId: string
): Promise<{ sheet: Awaited<ReturnType<typeof SheetRepository.findById>>; creative: Creative }> => {
  await ensureCreativeTables();
  return db.transaction(async () => {
    const targetCreativeRow = await db.queryOne<{
      id: string;
      name: string;
      image_url: string;
      manufacturer_name: string;
    }>(
      `
      SELECT c.id, c.name, c.image_url, m.name AS manufacturer_name
      FROM creatives c
      JOIN manufacturers m ON m.id = c.manufacturer_id
      WHERE c.id = $1
      FOR UPDATE
      `,
      [targetCreativeId]
    );
    if (!targetCreativeRow) {
      throw new Error('TARGET_CREATIVE_NOT_FOUND');
    }

    const sheetRow = await db.queryOne<CreativeWorkflowSheetRow>(
      `
      SELECT es.id, m.name AS manufacturer_name, es.status, es.entry_status, es.creative_status
      FROM entry_sheets es
      JOIN manufacturers m ON m.id = es.manufacturer_id
      WHERE es.id = $1
      FOR UPDATE
      `,
      [sheetId]
    );
    if (!sheetRow) {
      throw new Error('SHEET_NOT_FOUND');
    }
    if (!canModifyCreativeLinkage(sheetRow)) {
      throw new Error('SHEET_WORKFLOW_LOCKED');
    }

    const currentLink = await db.queryOne<{ creative_id: string }>(
      `
      SELECT creative_id
      FROM creative_entry_sheets
      WHERE sheet_id = $1
      FOR UPDATE
      `,
      [sheetId]
    );

    if (currentLink?.creative_id !== targetCreativeId) {
      await db.query(`DELETE FROM creative_entry_sheets WHERE sheet_id = $1`, [sheetId]);
      await db.query(
        `
        INSERT INTO creative_entry_sheets (creative_id, sheet_id)
        VALUES ($1, $2)
        `,
        [targetCreativeId, sheetId]
      );
    }

    const touchedCreativeIds = [...new Set([currentLink?.creative_id, targetCreativeId].filter(Boolean))];
    if (touchedCreativeIds.length > 0) {
      await db.query(
        `
        UPDATE creatives
        SET
          version = version + 1,
          updated_at = NOW()
        WHERE id = ANY($1)
        `,
        [touchedCreativeIds]
      );
    }

    await db.query(
      `
      UPDATE entry_sheets
      SET
        creative_name_snapshot = $2,
        creative_image_url_snapshot = $3,
        creative_updated_at_snapshot = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [sheetId, targetCreativeRow.name, targetCreativeRow.image_url]
    );

    const sheet = await SheetRepository.findById(sheetId);
    const creative = await findById(targetCreativeId);
    if (!sheet) {
      throw new Error('SHEET_RELOAD_FAILED');
    }
    if (!creative) {
      throw new Error('CREATIVE_RELOAD_FAILED');
    }
    return { sheet, creative };
  });
};

export const pruneByRetention = async (cutoff: Date): Promise<number> => {
  await ensureCreativeTables();
  const result = await db.query<{ id: string }>(
    `
    DELETE FROM creatives c
    WHERE c.updated_at < $1
      AND NOT EXISTS (
        SELECT 1
        FROM creative_entry_sheets ces
        WHERE ces.creative_id = c.id
      )
    RETURNING id
    `,
    [cutoff.toISOString()]
  );
  return result.rowCount;
};

export const pruneRetentionIfDue = async (): Promise<{ deletedCreatives: number }> => {
  if (Date.now() - lastCreativeRetentionRunAt < getRetentionConfig().runIntervalMs) {
    return { deletedCreatives: 0 };
  }
  if (!pruneRetentionIfDuePromise) {
    pruneRetentionIfDuePromise = db
      .transaction(async () => {
        const deletedCreatives = await pruneByRetention(getCreativeRetentionCutoff());
        lastCreativeRetentionRunAt = Date.now();
        return { deletedCreatives };
      })
      .finally(() => {
        pruneRetentionIfDuePromise = null;
      });
  }
  return pruneRetentionIfDuePromise;
};

export default {
  findAll,
  findById,
  findBySheetId,
  upsert,
  deleteById,
  relinkSheetToCreative,
  pruneByRetention,
  pruneRetentionIfDue,
};
