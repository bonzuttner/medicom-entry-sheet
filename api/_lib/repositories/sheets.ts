import * as db from '../db.js';
import { EntrySheet, ProductEntry, Attachment, EntrySheetRevision } from '../types.js';
import { ensureManufacturer } from './users.js';
import { randomUUID } from 'crypto';

/**
 * Sheet Repository
 *
 * Handles all database operations for entry_sheets, product_entries, and related tables.
 */

interface SheetRow {
  id: string;
  version: number;
  creator_id: string | null;
  creator_name: string;
  manufacturer_id: string;
  manufacturer_name: string;
  creator_email: string;
  creator_phone: string;
  title: string;
  notes: string | null;
  deployment_start_month: number | null;
  deployment_end_month: number | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminMemoRow {
  sheet_id: string;
  version: number;
  promo_code: string | null;
  board_picking_jan: string | null;
  deadline_table_url: string | null;
  band_pattern: string | null;
  target_store_count: number | null;
  print_board1_count: number | null;
  print_board2_count: number | null;
  print_band1_count: number | null;
  print_band2_count: number | null;
  print_other: string | null;
  equipment_note: string | null;
  admin_note: string | null;
}

interface EntrySheetRevisionRow {
  id: string;
  sheet_id: string;
  changed_by_user_id: string | null;
  changed_by_name_snapshot: string | null;
  summary: string;
  created_at: Date | string;
}

interface ProductRow {
  id: string;
  sheet_id: string;
  shelf_name: string;
  manufacturer_name: string;
  jan_code: string;
  product_name: string;
  product_image_url: string | null;
  risk_classification: string | null;
  catch_copy: string | null;
  product_message: string | null;
  product_notes: string | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  facing_count: number | null;
  arrival_date: Date | string | null;
  has_promo_material: boolean;
  promo_sample: string | null;
  special_fixture: string | null;
  promo_width: number | null;
  promo_height: number | null;
  promo_depth: number | null;
  promo_image_url: string | null;
}

const toIsoString = (value: Date | string | null | undefined): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const toDateOnlyString = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0];
};

const toSafeIso = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

const FULLWIDTH_SEARCH_CHARS =
  'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' +
  'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' +
  '０１２３４５６７８９　';
const HALFWIDTH_SEARCH_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789 ';
const KATAKANA_SEARCH_CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨ' +
  'ラリルレロワヲンァィゥェォャュョッヵヶヴ';
const HIRAGANA_SEARCH_CHARS =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ' +
  'らりるれろわをんぁぃぅぇぉゃゅょっゕゖゔ';

const normalizeKanaToHiragana = (value: string): string =>
  value.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );

const normalizeSearchText = (value: string): string => {
  return normalizeKanaToHiragana(value.normalize('NFKC')).toLowerCase().trim();
};

let ensureSnapshotColumnsPromise: Promise<void> | null = null;
let ensureCreatorReferencePromise: Promise<void> | null = null;
let ensureAdminMemoTablePromise: Promise<void> | null = null;
let ensureSheetVersionColumnPromise: Promise<void> | null = null;
let ensureSheetRevisionTablePromise: Promise<void> | null = null;
let ensureSheetStatusConstraintPromise: Promise<void> | null = null;
let ensureDeploymentColumnsPromise: Promise<void> | null = null;

const ensureSheetSnapshotColumns = async (): Promise<void> => {
  if (!ensureSnapshotColumnsPromise) {
    ensureSnapshotColumnsPromise = (async () => {
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creator_name_snapshot VARCHAR(200)`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creator_email_snapshot VARCHAR(255)`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS creator_phone_snapshot VARCHAR(50)`
      );
    })().catch((error) => {
      ensureSnapshotColumnsPromise = null;
      throw error;
    });
  }
  await ensureSnapshotColumnsPromise;
};

const ensureSheetVersionColumn = async (): Promise<void> => {
  if (!ensureSheetVersionColumnPromise) {
    ensureSheetVersionColumnPromise = (async () => {
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`
      );
    })().catch((error) => {
      ensureSheetVersionColumnPromise = null;
      throw error;
    });
  }
  await ensureSheetVersionColumnPromise;
};

const ensureAdminMemoTable = async (): Promise<void> => {
  if (!ensureAdminMemoTablePromise) {
    ensureAdminMemoTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS entry_sheet_admin_memos (
          sheet_id UUID PRIMARY KEY REFERENCES entry_sheets(id) ON DELETE CASCADE,
          version INTEGER NOT NULL DEFAULT 1,
          promo_code VARCHAR(50),
          board_picking_jan VARCHAR(13),
          deadline_table_url TEXT,
          band_pattern VARCHAR(100),
          target_store_count INTEGER,
          print_board1_count INTEGER,
          print_board2_count INTEGER,
          print_band1_count INTEGER,
          print_band2_count INTEGER,
          print_other TEXT,
          equipment_note TEXT,
          admin_note TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_entry_sheet_admin_memos_updated_at
        ON entry_sheet_admin_memos(updated_at DESC)
        `
      );
    })().catch((error) => {
      ensureAdminMemoTablePromise = null;
      throw error;
    });
  }
  await ensureAdminMemoTablePromise;
};

const ensureDeploymentColumns = async (): Promise<void> => {
  if (!ensureDeploymentColumnsPromise) {
    ensureDeploymentColumnsPromise = (async () => {
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS deployment_start_month SMALLINT`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD COLUMN IF NOT EXISTS deployment_end_month SMALLINT`
      );
    })().catch((error) => {
      ensureDeploymentColumnsPromise = null;
      throw error;
    });
  }
  await ensureDeploymentColumnsPromise;
};

const ensureSheetRevisionTable = async (): Promise<void> => {
  if (!ensureSheetRevisionTablePromise) {
    ensureSheetRevisionTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS entry_sheet_revisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sheet_id UUID NOT NULL REFERENCES entry_sheets(id) ON DELETE CASCADE,
          changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          changed_by_name_snapshot VARCHAR(200),
          summary TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_sheet_revisions_sheet_created_at
        ON entry_sheet_revisions(sheet_id, created_at DESC)
        `
      );
    })().catch((error) => {
      ensureSheetRevisionTablePromise = null;
      throw error;
    });
  }
  await ensureSheetRevisionTablePromise;
};

const ensureSheetStatusConstraint = async (): Promise<void> => {
  if (!ensureSheetStatusConstraintPromise) {
    ensureSheetStatusConstraintPromise = (async () => {
      await db.query(
        `
        ALTER TABLE entry_sheets
        DROP CONSTRAINT IF EXISTS entry_sheets_status_check
        `
      );
      await db.query(
        `
        ALTER TABLE entry_sheets
        ADD CONSTRAINT entry_sheets_status_check
        CHECK (status IN ('draft', 'completed', 'completed_no_image'))
        `
      );
    })().catch((error) => {
      ensureSheetStatusConstraintPromise = null;
      throw error;
    });
  }
  await ensureSheetStatusConstraintPromise;
};

const ensureSheetCreatorReference = async (): Promise<void> => {
  if (!ensureCreatorReferencePromise) {
    ensureCreatorReferencePromise = (async () => {
      await db.query(
        `ALTER TABLE entry_sheets
         ALTER COLUMN creator_id DROP NOT NULL`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         DROP CONSTRAINT IF EXISTS entry_sheets_creator_id_fkey`
      );
      await db.query(
        `ALTER TABLE entry_sheets
         ADD CONSTRAINT entry_sheets_creator_id_fkey
         FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL`
      );
    })().catch((error) => {
      ensureCreatorReferencePromise = null;
      throw error;
    });
  }
  await ensureCreatorReferencePromise;
};

interface IngredientRow {
  product_id: string;
  ingredient_name: string;
}

interface AttachmentRow {
  id: string;
  sheet_id: string | null;
  product_id: string | null;
  name: string;
  size: number;
  type: string;
  url: string;
}

/**
 * Convert database rows to EntrySheet object
 */
const rowsToSheet = (
  sheetRow: SheetRow,
  productRows: ProductRow[],
  ingredientsByProductId: Map<string, string[]>,
  attachmentsByProductId: Map<string, Attachment[]>,
  sheetAttachments: Attachment[],
  adminMemoBySheetId: Map<string, EntrySheet['adminMemo']>
): EntrySheet => {
  const products: ProductEntry[] = productRows.map((p) => {
    const ingredients = ingredientsByProductId.get(p.id) || [];
    const productAttachments = attachmentsByProductId.get(p.id) || [];

    return {
      id: p.id,
      shelfName: p.shelf_name,
      manufacturerName: p.manufacturer_name,
      janCode: p.jan_code,
      productName: p.product_name,
      productImage: p.product_image_url || undefined,
      riskClassification: p.risk_classification || undefined,
      catchCopy: p.catch_copy || undefined,
      productMessage: p.product_message || undefined,
      productNotes: p.product_notes || undefined,
      width: p.width || 0,
      height: p.height || 0,
      depth: p.depth || 0,
      facingCount: p.facing_count || 1,
      arrivalDate: toDateOnlyString(p.arrival_date),
      hasPromoMaterial: p.has_promo_material ? 'yes' : 'no',
      promoSample: p.promo_sample || undefined,
      specialFixture: p.special_fixture || undefined,
      promoWidth: p.promo_width || undefined,
      promoHeight: p.promo_height || undefined,
      promoDepth: p.promo_depth || undefined,
      promoImage: p.promo_image_url || undefined,
      specificIngredients: ingredients,
      productAttachments: productAttachments.length > 0 ? productAttachments : undefined,
    };
  });

  return {
    id: sheetRow.id,
    version: sheetRow.version || 1,
    creatorId: sheetRow.creator_id || '',
    creatorName: sheetRow.creator_name,
    manufacturerName: sheetRow.manufacturer_name,
    email: sheetRow.creator_email,
    phoneNumber: sheetRow.creator_phone,
    title: sheetRow.title,
    notes: sheetRow.notes || undefined,
    deploymentStartMonth: sheetRow.deployment_start_month ?? undefined,
    deploymentEndMonth: sheetRow.deployment_end_month ?? undefined,
    adminMemo: adminMemoBySheetId.get(sheetRow.id),
    status: sheetRow.status as 'draft' | 'completed' | 'completed_no_image',
    createdAt: toIsoString(sheetRow.created_at),
    updatedAt: toIsoString(sheetRow.updated_at),
    products,
    attachments: sheetAttachments.length > 0 ? sheetAttachments : undefined,
  };
};

const buildAttachmentsByProductId = (
  rows: AttachmentRow[]
): Map<string, Attachment[]> => {
  const map = new Map<string, Attachment[]>();
  for (const row of rows) {
    if (!row.product_id) continue;
    const list = map.get(row.product_id) || [];
    list.push({
      name: row.name,
      size: row.size,
      type: row.type,
      url: row.url,
    });
    map.set(row.product_id, list);
  }
  return map;
};

const buildSheetAttachmentsBySheetId = (
  rows: AttachmentRow[]
): Map<string, Attachment[]> => {
  const map = new Map<string, Attachment[]>();
  for (const row of rows) {
    if (!row.sheet_id || row.product_id) continue;
    const list = map.get(row.sheet_id) || [];
    list.push({
      name: row.name,
      size: row.size,
      type: row.type,
      url: row.url,
    });
    map.set(row.sheet_id, list);
  }
  return map;
};

const buildIngredientsByProductId = (
  rows: IngredientRow[]
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.product_id) || [];
    list.push(row.ingredient_name);
    map.set(row.product_id, list);
  }
  return map;
};

const buildAdminMemoBySheetId = (
  rows: AdminMemoRow[]
): Map<string, EntrySheet['adminMemo']> => {
  const map = new Map<string, EntrySheet['adminMemo']>();
  for (const row of rows) {
    map.set(row.sheet_id, {
      version: row.version || 1,
      promoCode: row.promo_code || undefined,
      boardPickingJan: row.board_picking_jan || undefined,
      deadlineTableUrl: row.deadline_table_url || undefined,
      bandPattern: row.band_pattern || undefined,
      targetStoreCount: row.target_store_count ?? undefined,
      printBoard1Count: row.print_board1_count ?? undefined,
      printBoard2Count: row.print_board2_count ?? undefined,
      printBand1Count: row.print_band1_count ?? undefined,
      printBand2Count: row.print_band2_count ?? undefined,
      printOther: row.print_other || undefined,
      equipmentNote: row.equipment_note || undefined,
      adminNote: row.admin_note || undefined,
    });
  }
  return map;
};

const fetchAdminMemoBySheetIds = async (
  sheetIds: string[]
): Promise<Map<string, EntrySheet['adminMemo']>> => {
  if (sheetIds.length === 0) return new Map();
  await ensureAdminMemoTable();
  const result = await db.query<AdminMemoRow>(
    `
    SELECT
      sheet_id, version, promo_code, board_picking_jan, deadline_table_url, band_pattern,
      target_store_count, print_board1_count, print_board2_count, print_band1_count,
      print_band2_count, print_other, equipment_note, admin_note
    FROM entry_sheet_admin_memos
    WHERE sheet_id = ANY($1)
    `,
    [sheetIds]
  );
  return buildAdminMemoBySheetId(result.rows);
};

/**
 * Get all sheets (for ADMIN)
 */
export const findAll = async (limit?: number, offset: number = 0): Promise<EntrySheet[]> => {
  await ensureSheetCreatorReference();
  await ensureSheetSnapshotColumns();
  await ensureAdminMemoTable();
  await ensureSheetVersionColumn();
  await ensureDeploymentColumns();
  const hasPaging = typeof limit === 'number';
  const sheetQuery = `
    SELECT
      s.id, s.version, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.deployment_start_month, s.deployment_end_month,
      s.created_at, s.updated_at,
      COALESCE(s.creator_name_snapshot, u.display_name, '') as creator_name,
      COALESCE(s.creator_email_snapshot, u.email, '') as creator_email,
      COALESCE(s.creator_phone_snapshot, u.phone_number, '') as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    LEFT JOIN users u ON s.creator_id = u.id
    JOIN manufacturers m ON s.manufacturer_id = m.id
    ORDER BY s.created_at DESC
    ${hasPaging ? 'LIMIT $1 OFFSET $2' : ''}
  `;
  const sheetParams = hasPaging ? [limit!, offset] : undefined;
  const sheetResult = await db.query<SheetRow>(
    sheetQuery,
    sheetParams
  );

  if (sheetResult.rows.length === 0) return [];

  const sheetIds = sheetResult.rows.map((s) => s.id);

  const [productResult, ingredientResult, attachmentResult] = await Promise.all([
    db.query<ProductRow>(
      `
      SELECT p.*, m.name as manufacturer_name
      FROM product_entries p
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE p.sheet_id = ANY($1)
      ORDER BY p.created_at
      `,
      [sheetIds]
    ),
    db.query<IngredientRow>(
      `
      SELECT pi.product_id, pi.ingredient_name
      FROM product_ingredients pi
      JOIN product_entries p ON pi.product_id = p.id
      WHERE p.sheet_id = ANY($1)
      `,
      [sheetIds]
    ),
    db.query<AttachmentRow>(
      `
      SELECT *
      FROM attachments
      WHERE sheet_id = ANY($1)
         OR product_id IN (
           SELECT id FROM product_entries WHERE sheet_id = ANY($1)
         )
      `,
      [sheetIds]
    ),
  ]);

  const productsBySheetId = new Map<string, ProductRow[]>();
  for (const productRow of productResult.rows) {
    const list = productsBySheetId.get(productRow.sheet_id) || [];
    list.push(productRow);
    productsBySheetId.set(productRow.sheet_id, list);
  }
  const ingredientsByProductId = buildIngredientsByProductId(ingredientResult.rows);
  const attachmentsByProductId = buildAttachmentsByProductId(attachmentResult.rows);
  const sheetAttachmentsBySheetId = buildSheetAttachmentsBySheetId(attachmentResult.rows);
  const adminMemoBySheetId = await fetchAdminMemoBySheetIds(sheetIds);

  const sheets = sheetResult.rows.map((sheetRow) =>
    rowsToSheet(
      sheetRow,
      productsBySheetId.get(sheetRow.id) || [],
      ingredientsByProductId,
      attachmentsByProductId,
      sheetAttachmentsBySheetId.get(sheetRow.id) || [],
      adminMemoBySheetId
    )
  );

  return sheets;
};

/**
 * Get sheets by manufacturer ID (for STAFF)
 */
export const findByManufacturerId = async (
  manufacturerId: string,
  limit?: number,
  offset: number = 0
): Promise<EntrySheet[]> => {
  await ensureSheetCreatorReference();
  await ensureSheetSnapshotColumns();
  await ensureAdminMemoTable();
  await ensureSheetVersionColumn();
  await ensureDeploymentColumns();
  const hasPaging = typeof limit === 'number';
  const sheetQuery = `
    SELECT
      s.id, s.version, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.deployment_start_month, s.deployment_end_month,
      s.created_at, s.updated_at,
      COALESCE(s.creator_name_snapshot, u.display_name, '') as creator_name,
      COALESCE(s.creator_email_snapshot, u.email, '') as creator_email,
      COALESCE(s.creator_phone_snapshot, u.phone_number, '') as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    LEFT JOIN users u ON s.creator_id = u.id
    JOIN manufacturers m ON s.manufacturer_id = m.id
    WHERE s.manufacturer_id = $1
    ORDER BY s.created_at DESC
    ${hasPaging ? 'LIMIT $2 OFFSET $3' : ''}
    `;
  const sheetParams = hasPaging ? [manufacturerId, limit!, offset] : [manufacturerId];
  const sheetResult = await db.query<SheetRow>(
    sheetQuery,
    sheetParams
  );

  if (sheetResult.rows.length === 0) return [];

  const sheetIds = sheetResult.rows.map((s) => s.id);

  const [productResult, ingredientResult, attachmentResult] = await Promise.all([
    db.query<ProductRow>(
      `
      SELECT p.*, m.name as manufacturer_name
      FROM product_entries p
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE p.sheet_id = ANY($1)
      ORDER BY p.created_at
      `,
      [sheetIds]
    ),
    db.query<IngredientRow>(
      `
      SELECT pi.product_id, pi.ingredient_name
      FROM product_ingredients pi
      JOIN product_entries p ON pi.product_id = p.id
      WHERE p.sheet_id = ANY($1)
      `,
      [sheetIds]
    ),
    db.query<AttachmentRow>(
      `
      SELECT *
      FROM attachments
      WHERE sheet_id = ANY($1)
         OR product_id IN (
           SELECT id FROM product_entries WHERE sheet_id = ANY($1)
         )
      `,
      [sheetIds]
    ),
  ]);

  const productsBySheetId = new Map<string, ProductRow[]>();
  for (const productRow of productResult.rows) {
    const list = productsBySheetId.get(productRow.sheet_id) || [];
    list.push(productRow);
    productsBySheetId.set(productRow.sheet_id, list);
  }
  const ingredientsByProductId = buildIngredientsByProductId(ingredientResult.rows);
  const attachmentsByProductId = buildAttachmentsByProductId(attachmentResult.rows);
  const sheetAttachmentsBySheetId = buildSheetAttachmentsBySheetId(attachmentResult.rows);
  const adminMemoBySheetId = await fetchAdminMemoBySheetIds(sheetIds);

  const sheets = sheetResult.rows.map((sheetRow) =>
    rowsToSheet(
      sheetRow,
      productsBySheetId.get(sheetRow.id) || [],
      ingredientsByProductId,
      attachmentsByProductId,
      sheetAttachmentsBySheetId.get(sheetRow.id) || [],
      adminMemoBySheetId
    )
  );

  return sheets;
};

export const countAll = async (): Promise<number> => {
  await ensureSheetCreatorReference();
  const result = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM entry_sheets`);
  return Number(result.rows[0]?.count || 0);
};

export const countByManufacturerId = async (manufacturerId: string): Promise<number> => {
  await ensureSheetCreatorReference();
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM entry_sheets WHERE manufacturer_id = $1`,
    [manufacturerId]
  );
  return Number(result.rows[0]?.count || 0);
};

/**
 * Get single sheet by ID
 */
export const findById = async (sheetId: string): Promise<EntrySheet | null> => {
  await ensureSheetCreatorReference();
  await ensureSheetSnapshotColumns();
  await ensureAdminMemoTable();
  await ensureSheetVersionColumn();
  await ensureDeploymentColumns();
  const sheetResult = await db.query<SheetRow>(
    `
    SELECT
      s.id, s.version, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.deployment_start_month, s.deployment_end_month,
      s.created_at, s.updated_at,
      COALESCE(s.creator_name_snapshot, u.display_name, '') as creator_name,
      COALESCE(s.creator_email_snapshot, u.email, '') as creator_email,
      COALESCE(s.creator_phone_snapshot, u.phone_number, '') as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    LEFT JOIN users u ON s.creator_id = u.id
    JOIN manufacturers m ON s.manufacturer_id = m.id
    WHERE s.id = $1
    `,
    [sheetId]
  );

  if (sheetResult.rows.length === 0) return null;

  const [productResult, ingredientResult, attachmentResult] = await Promise.all([
    db.query<ProductRow>(
      `
      SELECT p.*, m.name as manufacturer_name
      FROM product_entries p
      JOIN manufacturers m ON p.manufacturer_id = m.id
      WHERE p.sheet_id = $1
      ORDER BY p.created_at
      `,
      [sheetId]
    ),
    db.query<IngredientRow>(
      `
      SELECT pi.product_id, pi.ingredient_name
      FROM product_ingredients pi
      JOIN product_entries p ON pi.product_id = p.id
      WHERE p.sheet_id = $1
      `,
      [sheetId]
    ),
    db.query<AttachmentRow>(
      `
      SELECT *
      FROM attachments
      WHERE sheet_id = $1
         OR product_id IN (
           SELECT id FROM product_entries WHERE sheet_id = $1
         )
      `,
      [sheetId]
    ),
  ]);

  const ingredientsByProductId = buildIngredientsByProductId(ingredientResult.rows);
  const attachmentsByProductId = buildAttachmentsByProductId(attachmentResult.rows);
  const sheetAttachmentsBySheetId = buildSheetAttachmentsBySheetId(attachmentResult.rows);
  const adminMemoBySheetId = await fetchAdminMemoBySheetIds([sheetResult.rows[0].id]);

  return rowsToSheet(
    sheetResult.rows[0],
    productResult.rows,
    ingredientsByProductId,
    attachmentsByProductId,
    sheetAttachmentsBySheetId.get(sheetResult.rows[0].id) || [],
    adminMemoBySheetId
  );
};

/**
 * Upsert sheet with products (transactional)
 */
export const upsert = async (
  sheet: EntrySheet,
  revision?: {
    changedByUserId: string | null;
    changedByName: string;
    summary: string;
    keepLatestCount?: number;
    updateAdminMemo?: boolean;
    expectedVersion?: number;
    forceOverwrite?: boolean;
  }
): Promise<void> => {
  await ensureSheetCreatorReference();
  await ensureSheetSnapshotColumns();
  await ensureAdminMemoTable();
  await ensureSheetVersionColumn();
  await ensureSheetRevisionTable();
  await ensureSheetStatusConstraint();
  await ensureDeploymentColumns();
  return await db.transaction(async () => {
    const nowIso = new Date().toISOString();
    const normalizedSheet: EntrySheet = {
      ...sheet,
      version:
        Number.isInteger(Number(sheet.version)) && Number(sheet.version) > 0
          ? Number(sheet.version)
          : 1,
      creatorName: String(sheet.creatorName || '').trim(),
      title: String(sheet.title || '').trim(),
      notes: sheet.notes ? String(sheet.notes).trim() : '',
      deploymentStartMonth:
        Number.isInteger(Number(sheet.deploymentStartMonth)) &&
        Number(sheet.deploymentStartMonth) >= 1 &&
        Number(sheet.deploymentStartMonth) <= 12
          ? Number(sheet.deploymentStartMonth)
          : undefined,
      deploymentEndMonth:
        Number.isInteger(Number(sheet.deploymentEndMonth)) &&
        Number(sheet.deploymentEndMonth) >= 1 &&
        Number(sheet.deploymentEndMonth) <= 12
          ? Number(sheet.deploymentEndMonth)
          : undefined,
      email: String(sheet.email || '').trim(),
      phoneNumber: String(sheet.phoneNumber || '').trim(),
      manufacturerName: String(sheet.manufacturerName || '').trim(),
      createdAt: toSafeIso(sheet.createdAt, nowIso),
      updatedAt: nowIso,
      status:
        sheet.status === 'completed'
          ? 'completed'
          : sheet.status === 'completed_no_image'
            ? 'completed_no_image'
            : 'draft',
      adminMemo: {
        version:
          Number.isInteger(Number(sheet.adminMemo?.version)) && Number(sheet.adminMemo?.version) > 0
            ? Number(sheet.adminMemo?.version)
            : 1,
        promoCode: String(sheet.adminMemo?.promoCode || '').trim() || undefined,
        boardPickingJan: String(sheet.adminMemo?.boardPickingJan || '').trim() || undefined,
        deadlineTableUrl: String(sheet.adminMemo?.deadlineTableUrl || '').trim() || undefined,
        bandPattern: String(sheet.adminMemo?.bandPattern || '').trim() || undefined,
        targetStoreCount: sheet.adminMemo?.targetStoreCount,
        printBoard1Count: sheet.adminMemo?.printBoard1Count,
        printBoard2Count: sheet.adminMemo?.printBoard2Count,
        printBand1Count: sheet.adminMemo?.printBand1Count,
        printBand2Count: sheet.adminMemo?.printBand2Count,
        printOther: String(sheet.adminMemo?.printOther || '').trim() || undefined,
        equipmentNote: String(sheet.adminMemo?.equipmentNote || '').trim() || undefined,
        adminNote: String(sheet.adminMemo?.adminNote || '').trim() || undefined,
      },
      products: Array.isArray(sheet.products) ? sheet.products : [],
      attachments: Array.isArray(sheet.attachments) ? sheet.attachments : [],
    };

    const manufacturerIdCache = new Map<string, string>();
    const getManufacturerIdCached = async (manufacturerName: string): Promise<string> => {
      const key = manufacturerName.trim();
      const cached = manufacturerIdCache.get(key);
      if (cached) return cached;
      const resolved = await ensureManufacturer(key);
      manufacturerIdCache.set(key, resolved);
      return resolved;
    };

    const manufacturerId = await getManufacturerIdCached(normalizedSheet.manufacturerName);
    const creatorId = String(normalizedSheet.creatorId || '').trim() || null;
    const existingVersionResult = await db.query<{ version: number }>(
      `SELECT version FROM entry_sheets WHERE id = $1 FOR UPDATE`,
      [normalizedSheet.id]
    );
    const existingVersion = existingVersionResult.rows[0]?.version;
    const expectedVersion =
      Number.isInteger(Number(revision?.expectedVersion)) && Number(revision?.expectedVersion) > 0
        ? Number(revision?.expectedVersion)
        : undefined;

    if (
      existingVersion !== undefined &&
      expectedVersion !== undefined &&
      expectedVersion !== existingVersion &&
      !revision?.forceOverwrite
    ) {
      throw new Error('VERSION_CONFLICT');
    }

    normalizedSheet.version =
      existingVersion !== undefined ? existingVersion + 1 : Math.max(1, normalizedSheet.version || 1);

    // Upsert entry_sheet
    await db.query(
      `
      INSERT INTO entry_sheets (
        id, version, creator_id, manufacturer_id,
        creator_name_snapshot, creator_email_snapshot, creator_phone_snapshot,
        title, notes, deployment_start_month, deployment_end_month,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        version = EXCLUDED.version,
        creator_name_snapshot = EXCLUDED.creator_name_snapshot,
        creator_email_snapshot = EXCLUDED.creator_email_snapshot,
        creator_phone_snapshot = EXCLUDED.creator_phone_snapshot,
        title = EXCLUDED.title,
        notes = EXCLUDED.notes,
        deployment_start_month = EXCLUDED.deployment_start_month,
        deployment_end_month = EXCLUDED.deployment_end_month,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
      `,
      [
        normalizedSheet.id,
        normalizedSheet.version,
        creatorId,
        manufacturerId,
        normalizedSheet.creatorName || null,
        normalizedSheet.email || null,
        normalizedSheet.phoneNumber || null,
        normalizedSheet.title,
        normalizedSheet.notes || null,
        normalizedSheet.deploymentStartMonth ?? null,
        normalizedSheet.deploymentEndMonth ?? null,
        normalizedSheet.status,
        normalizedSheet.createdAt,
        normalizedSheet.updatedAt,
      ]
    );

    const existingProductRows = await db.query<{ id: string }>(
      `SELECT id FROM product_entries WHERE sheet_id = $1`,
      [normalizedSheet.id]
    );
    const existingProductIds = new Set(existingProductRows.rows.map((row) => row.id));
    const incomingIds = normalizedSheet.products
      .map((product) => product.id)
      .filter((id): id is string => Boolean(id));
    const incomingProductRows =
      incomingIds.length > 0
        ? await db.query<{ id: string; sheet_id: string }>(
            `SELECT id, sheet_id FROM product_entries WHERE id = ANY($1)`,
            [incomingIds]
          )
        : { rows: [] as { id: string; sheet_id: string }[] };
    const productOwnerById = new Map(incomingProductRows.rows.map((row) => [row.id, row.sheet_id]));

    // Upsert products
    const usedProductIds = new Set<string>();
    const finalProductIds = new Set<string>();
    const ingredientRows: Array<{ productId: string; ingredientName: string }> = [];
    const productAttachmentRows: Array<{
      productId: string;
      name: string;
      size: number;
      type: string;
      url: string;
    }> = [];
    for (const product of normalizedSheet.products) {
      const productManufacturerName = String(
        product.manufacturerName || normalizedSheet.manufacturerName
      ).trim();
      const productManufacturerId = await getManufacturerIdCached(productManufacturerName);
      let productId = product.id || randomUUID();

      // Ensure product ID uniqueness within this save request.
      while (usedProductIds.has(productId)) {
        productId = randomUUID();
      }
      // If provided ID already belongs to another sheet, replace with new UUID.
      if (productOwnerById.has(productId) && productOwnerById.get(productId) !== normalizedSheet.id) {
        productId = randomUUID();
        while (usedProductIds.has(productId)) {
          productId = randomUUID();
        }
      }
      usedProductIds.add(productId);
      finalProductIds.add(productId);

      await db.query(
        `
        INSERT INTO product_entries (
          id, sheet_id, shelf_name, manufacturer_id, jan_code, product_name,
          product_image_url, risk_classification, catch_copy, product_message,
          product_notes, width, height, depth, facing_count, arrival_date,
          has_promo_material, promo_sample, special_fixture,
          promo_width, promo_height, promo_depth, promo_image_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (id) DO UPDATE SET
          sheet_id = EXCLUDED.sheet_id,
          shelf_name = EXCLUDED.shelf_name,
          manufacturer_id = EXCLUDED.manufacturer_id,
          jan_code = EXCLUDED.jan_code,
          product_name = EXCLUDED.product_name,
          product_image_url = EXCLUDED.product_image_url,
          risk_classification = EXCLUDED.risk_classification,
          catch_copy = EXCLUDED.catch_copy,
          product_message = EXCLUDED.product_message,
          product_notes = EXCLUDED.product_notes,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          depth = EXCLUDED.depth,
          facing_count = EXCLUDED.facing_count,
          arrival_date = EXCLUDED.arrival_date,
          has_promo_material = EXCLUDED.has_promo_material,
          promo_sample = EXCLUDED.promo_sample,
          special_fixture = EXCLUDED.special_fixture,
          promo_width = EXCLUDED.promo_width,
          promo_height = EXCLUDED.promo_height,
          promo_depth = EXCLUDED.promo_depth,
          promo_image_url = EXCLUDED.promo_image_url
        `,
        [
          productId,
          normalizedSheet.id,
          String(product.shelfName || '').trim(),
          productManufacturerId,
          String(product.janCode || '').trim(),
          String(product.productName || '').trim(),
          product.productImage || null,
          product.riskClassification || null,
          product.catchCopy || null,
          product.productMessage || null,
          product.productNotes || null,
          product.width,
          product.height,
          product.depth,
          product.facingCount,
          product.arrivalDate || null,
          product.hasPromoMaterial === 'yes',
          product.promoSample || null,
          product.specialFixture || null,
          product.promoWidth || null,
          product.promoHeight || null,
          product.promoDepth || null,
          product.promoImage || null,
        ]
      );

      if (product.specificIngredients && product.specificIngredients.length > 0) {
        const ingredients = [...new Set(product.specificIngredients.map((value) => value.trim()).filter(Boolean))];
        ingredients.forEach((ingredientName) => {
          ingredientRows.push({ productId, ingredientName });
        });
      }

      if (product.productAttachments && product.productAttachments.length > 0) {
        const normalizedAttachments = product.productAttachments
          .map((attachment) => ({
            name: String(attachment.name || '').trim(),
            size: Number(attachment.size) || 0,
            type: String(attachment.type || '').trim(),
            url: String(attachment.url || '').trim(),
          }))
          .filter((attachment) => attachment.name && attachment.url);

        normalizedAttachments.forEach((attachment) => {
          productAttachmentRows.push({
            productId,
            name: attachment.name,
            size: attachment.size,
            type: attachment.type,
            url: attachment.url,
          });
        });
      }
    }

    const removedProductIds = [...existingProductIds].filter((id) => !finalProductIds.has(id));
    if (removedProductIds.length > 0) {
      await db.query(`DELETE FROM product_entries WHERE id = ANY($1)`, [removedProductIds]);
    }

    const finalProductIdsArray = [...finalProductIds];
    if (finalProductIdsArray.length > 0) {
      await db.query(`DELETE FROM product_ingredients WHERE product_id = ANY($1)`, [finalProductIdsArray]);
      if (ingredientRows.length > 0) {
        await db.query(
          `
          INSERT INTO product_ingredients (product_id, ingredient_name)
          SELECT items.product_id, items.ingredient_name
          FROM unnest(
            $1::uuid[],
            $2::text[]
          ) AS items(product_id, ingredient_name)
          `,
          [ingredientRows.map((row) => row.productId), ingredientRows.map((row) => row.ingredientName)]
        );
      }

      await db.query(`DELETE FROM attachments WHERE product_id = ANY($1)`, [finalProductIdsArray]);
      if (productAttachmentRows.length > 0) {
        await db.query(
          `
          INSERT INTO attachments (product_id, name, size, type, url)
          SELECT
            items.product_id,
            items.name,
            items.size,
            items.type,
            items.url
          FROM unnest(
            $1::uuid[],
            $2::text[],
            $3::bigint[],
            $4::text[],
            $5::text[]
          ) AS items(product_id, name, size, type, url)
          `,
          [
            productAttachmentRows.map((row) => row.productId),
            productAttachmentRows.map((row) => row.name),
            productAttachmentRows.map((row) => row.size),
            productAttachmentRows.map((row) => row.type),
            productAttachmentRows.map((row) => row.url),
          ]
        );
      }
    }

    // Delete existing attachments
    await db.query(`DELETE FROM attachments WHERE sheet_id = $1`, [normalizedSheet.id]);

    // Insert sheet attachments in bulk
    if (normalizedSheet.attachments && normalizedSheet.attachments.length > 0) {
      const normalizedAttachments = normalizedSheet.attachments
        .map((attachment) => ({
          name: String(attachment.name || '').trim(),
          size: Number(attachment.size) || 0,
          type: String(attachment.type || '').trim(),
          url: String(attachment.url || '').trim(),
        }))
        .filter((attachment) => attachment.name && attachment.url);

      if (normalizedAttachments.length > 0) {
        await db.query(
          `
          INSERT INTO attachments (sheet_id, name, size, type, url)
          SELECT
            $1,
            items.name,
            items.size,
            items.type,
            items.url
          FROM unnest(
            $2::text[],
            $3::bigint[],
            $4::text[],
            $5::text[]
          ) AS items(name, size, type, url)
          `,
          [
            normalizedSheet.id,
            normalizedAttachments.map((attachment) => attachment.name),
            normalizedAttachments.map((attachment) => attachment.size),
            normalizedAttachments.map((attachment) => attachment.type),
            normalizedAttachments.map((attachment) => attachment.url),
          ]
        );
      }
    }

    if (revision?.updateAdminMemo) {
      const memoVersionResult = await db.query<{ version: number }>(
        `SELECT version FROM entry_sheet_admin_memos WHERE sheet_id = $1 FOR UPDATE`,
        [normalizedSheet.id]
      );
      const currentMemoVersion = memoVersionResult.rows[0]?.version;
      const expectedMemoVersion =
        Number.isInteger(Number(normalizedSheet.adminMemo?.version)) &&
        Number(normalizedSheet.adminMemo?.version) > 0
          ? Number(normalizedSheet.adminMemo?.version)
          : undefined;

      if (
        currentMemoVersion !== undefined &&
        expectedMemoVersion !== undefined &&
        expectedMemoVersion !== currentMemoVersion &&
        !revision?.forceOverwrite
      ) {
        throw new Error('ADMIN_MEMO_VERSION_CONFLICT');
      }

      const nextMemoVersion =
        currentMemoVersion !== undefined ? currentMemoVersion + 1 : Math.max(1, expectedMemoVersion || 1);

      await db.query(
        `
        INSERT INTO entry_sheet_admin_memos (
          sheet_id, version, promo_code, board_picking_jan, deadline_table_url,
          band_pattern, target_store_count, print_board1_count, print_board2_count,
          print_band1_count, print_band2_count, print_other, equipment_note, admin_note, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (sheet_id) DO UPDATE SET
          version = EXCLUDED.version,
          promo_code = EXCLUDED.promo_code,
          board_picking_jan = EXCLUDED.board_picking_jan,
          deadline_table_url = EXCLUDED.deadline_table_url,
          band_pattern = EXCLUDED.band_pattern,
          target_store_count = EXCLUDED.target_store_count,
          print_board1_count = EXCLUDED.print_board1_count,
          print_board2_count = EXCLUDED.print_board2_count,
          print_band1_count = EXCLUDED.print_band1_count,
          print_band2_count = EXCLUDED.print_band2_count,
          print_other = EXCLUDED.print_other,
          equipment_note = EXCLUDED.equipment_note,
          admin_note = EXCLUDED.admin_note,
          updated_at = EXCLUDED.updated_at
        `,
        [
          normalizedSheet.id,
          nextMemoVersion,
          normalizedSheet.adminMemo?.promoCode || null,
          normalizedSheet.adminMemo?.boardPickingJan || null,
          normalizedSheet.adminMemo?.deadlineTableUrl || null,
          normalizedSheet.adminMemo?.bandPattern || null,
          normalizedSheet.adminMemo?.targetStoreCount ?? null,
          normalizedSheet.adminMemo?.printBoard1Count ?? null,
          normalizedSheet.adminMemo?.printBoard2Count ?? null,
          normalizedSheet.adminMemo?.printBand1Count ?? null,
          normalizedSheet.adminMemo?.printBand2Count ?? null,
          normalizedSheet.adminMemo?.printOther || null,
          normalizedSheet.adminMemo?.equipmentNote || null,
          normalizedSheet.adminMemo?.adminNote || null,
          nowIso,
        ]
      );
    }

    if (revision) {
      await db.query(
        `
        INSERT INTO entry_sheet_revisions (
          sheet_id, changed_by_user_id, changed_by_name_snapshot, summary
        ) VALUES ($1, $2, $3, $4)
        `,
        [
          normalizedSheet.id,
          revision.changedByUserId,
          revision.changedByName,
          revision.summary,
        ]
      );

      await db.query(
        `
        DELETE FROM entry_sheet_revisions
        WHERE id IN (
          SELECT id
          FROM entry_sheet_revisions
          WHERE sheet_id = $1
          ORDER BY created_at DESC
          OFFSET $2
        )
        `,
        [normalizedSheet.id, revision.keepLatestCount ?? 30]
      );
    }

    return;
  });
};

/**
 * Delete sheet by ID
 */
export const deleteById = async (sheetId: string): Promise<boolean> => {
  const result = await db.query(`DELETE FROM entry_sheets WHERE id = $1`, [sheetId]);
  return result.rowCount > 0;
};

export const addRevision = async (
  sheetId: string,
  changedByUserId: string | null,
  changedByName: string,
  summary: string,
  keepLatestCount: number = 30
): Promise<void> => {
  await ensureSheetRevisionTable();
  await db.query(
    `
    INSERT INTO entry_sheet_revisions (
      sheet_id, changed_by_user_id, changed_by_name_snapshot, summary
    ) VALUES ($1, $2, $3, $4)
    `,
    [sheetId, changedByUserId, changedByName, summary]
  );

  await db.query(
    `
    DELETE FROM entry_sheet_revisions
    WHERE id IN (
      SELECT id
      FROM entry_sheet_revisions
      WHERE sheet_id = $1
      ORDER BY created_at DESC
      OFFSET $2
    )
    `,
    [sheetId, keepLatestCount]
  );
};

export const updateAdminMemoOnly = async (
  sheetId: string,
  adminMemo: EntrySheet['adminMemo'] | undefined,
  revision?: {
    changedByUserId: string | null;
    changedByName: string;
    summary: string;
    keepLatestCount?: number;
    expectedVersion?: number;
    forceOverwrite?: boolean;
  }
): Promise<boolean> => {
  await ensureAdminMemoTable();
  await ensureSheetVersionColumn();
  await ensureSheetRevisionTable();
  const nowIso = new Date().toISOString();
  const current = await db.query<{ id: string }>(
    `SELECT id FROM entry_sheets WHERE id = $1`,
    [sheetId]
  );
  if (current.rowCount === 0) return false;

  const currentMemo = await db.query<{ version: number }>(
    `SELECT version FROM entry_sheet_admin_memos WHERE sheet_id = $1 FOR UPDATE`,
    [sheetId]
  );
  const currentVersion = currentMemo.rows[0]?.version;
  const expectedVersion =
    Number.isInteger(Number(revision?.expectedVersion)) && Number(revision?.expectedVersion) > 0
      ? Number(revision?.expectedVersion)
      : undefined;
  if (
    currentVersion !== undefined &&
    expectedVersion !== undefined &&
    currentVersion !== expectedVersion &&
    !revision?.forceOverwrite
  ) {
    throw new Error('ADMIN_MEMO_VERSION_CONFLICT');
  }
  const nextVersion = currentVersion !== undefined ? currentVersion + 1 : Math.max(1, expectedVersion || 1);

  const result = await db.query(
    `
    INSERT INTO entry_sheet_admin_memos (
      sheet_id, version, promo_code, board_picking_jan, deadline_table_url,
      band_pattern, target_store_count, print_board1_count, print_board2_count,
      print_band1_count, print_band2_count, print_other, equipment_note, admin_note, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15
    )
    ON CONFLICT (sheet_id) DO UPDATE SET
      version = EXCLUDED.version,
      promo_code = EXCLUDED.promo_code,
      board_picking_jan = EXCLUDED.board_picking_jan,
      deadline_table_url = EXCLUDED.deadline_table_url,
      band_pattern = EXCLUDED.band_pattern,
      target_store_count = EXCLUDED.target_store_count,
      print_board1_count = EXCLUDED.print_board1_count,
      print_board2_count = EXCLUDED.print_board2_count,
      print_band1_count = EXCLUDED.print_band1_count,
      print_band2_count = EXCLUDED.print_band2_count,
      print_other = EXCLUDED.print_other,
      equipment_note = EXCLUDED.equipment_note,
      admin_note = EXCLUDED.admin_note,
      updated_at = EXCLUDED.updated_at
    `,
    [
      sheetId,
      nextVersion,
      adminMemo?.promoCode || null,
      adminMemo?.boardPickingJan || null,
      adminMemo?.deadlineTableUrl || null,
      adminMemo?.bandPattern || null,
      adminMemo?.targetStoreCount ?? null,
      adminMemo?.printBoard1Count ?? null,
      adminMemo?.printBoard2Count ?? null,
      adminMemo?.printBand1Count ?? null,
      adminMemo?.printBand2Count ?? null,
      adminMemo?.printOther || null,
      adminMemo?.equipmentNote || null,
      adminMemo?.adminNote || null,
      nowIso,
    ]
  );
  if (result.rowCount === 0) return false;

  if (revision) {
    await addRevision(
      sheetId,
      revision.changedByUserId,
      revision.changedByName,
      revision.summary,
      revision.keepLatestCount ?? 30
    );
  }

  return true;
};

export const listRevisionsBySheetId = async (sheetId: string): Promise<EntrySheetRevision[]> => {
  await ensureSheetRevisionTable();
  const result = await db.query<EntrySheetRevisionRow>(
    `
    SELECT id, sheet_id, changed_by_user_id, changed_by_name_snapshot, summary, created_at
    FROM entry_sheet_revisions
    WHERE sheet_id = $1
    ORDER BY created_at DESC
    `,
    [sheetId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sheetId: row.sheet_id,
    changedAt: toIsoString(row.created_at),
    changedByUserId: row.changed_by_user_id || undefined,
    changedByName: row.changed_by_name_snapshot || '',
    summary: row.summary,
  }));
};

export const searchProductsByManufacturerId = async (
  manufacturerId: string,
  keyword: string,
  limit: number = 30
): Promise<ProductEntry[]> => {
  const trimmedKeyword = keyword.trim();
  const normalizedKeyword = normalizeSearchText(keyword);
  const result = await db.query<{
    id: string;
    shelf_name: string;
    manufacturer_name: string;
    jan_code: string;
    product_name: string;
    product_image_url: string | null;
    risk_classification: string | null;
    catch_copy: string | null;
    product_message: string | null;
    product_notes: string | null;
    width: number | null;
    height: number | null;
    depth: number | null;
    facing_count: number | null;
    arrival_date: Date | string | null;
    has_promo_material: boolean;
    promo_sample: string | null;
    special_fixture: string | null;
    promo_width: number | null;
    promo_height: number | null;
    promo_depth: number | null;
    promo_image_url: string | null;
    ingredient_names: string[] | null;
  }>(
    `
    SELECT
      p.id,
      p.shelf_name,
      m.name as manufacturer_name,
      p.jan_code,
      p.product_name,
      p.product_image_url,
      p.risk_classification,
      p.catch_copy,
      p.product_message,
      p.product_notes,
      p.width,
      p.height,
      p.depth,
      p.facing_count,
      p.arrival_date,
      p.has_promo_material,
      p.promo_sample,
      p.special_fixture,
      p.promo_width,
      p.promo_height,
      p.promo_depth,
      p.promo_image_url,
      array_remove(array_agg(pi.ingredient_name ORDER BY pi.ingredient_name), NULL) as ingredient_names
    FROM product_entries p
    JOIN manufacturers m ON p.manufacturer_id = m.id
    LEFT JOIN product_ingredients pi ON pi.product_id = p.id
    WHERE p.manufacturer_id = $1
      AND (
        $2 = ''
        OR p.product_name ILIKE ('%' || $2 || '%')
        OR p.jan_code ILIKE ('%' || $2 || '%')
        OR lower(
          translate(
            translate(p.product_name, '${FULLWIDTH_SEARCH_CHARS}', '${HALFWIDTH_SEARCH_CHARS}'),
            '${KATAKANA_SEARCH_CHARS}',
            '${HIRAGANA_SEARCH_CHARS}'
          )
        ) LIKE ('%' || $3 || '%')
        OR lower(
          translate(
            translate(p.jan_code, '${FULLWIDTH_SEARCH_CHARS}', '${HALFWIDTH_SEARCH_CHARS}'),
            '${KATAKANA_SEARCH_CHARS}',
            '${HIRAGANA_SEARCH_CHARS}'
          )
        ) LIKE ('%' || $3 || '%')
      )
    GROUP BY
      p.id,
      p.shelf_name,
      m.name,
      p.jan_code,
      p.product_name,
      p.product_image_url,
      p.risk_classification,
      p.catch_copy,
      p.product_message,
      p.product_notes,
      p.width,
      p.height,
      p.depth,
      p.facing_count,
      p.arrival_date,
      p.has_promo_material,
      p.promo_sample,
      p.special_fixture,
      p.promo_width,
      p.promo_height,
      p.promo_depth,
      p.promo_image_url
    ORDER BY p.jan_code ASC, p.product_name ASC
    LIMIT $4
    `,
    [manufacturerId, trimmedKeyword, normalizedKeyword, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    shelfName: row.shelf_name,
    manufacturerName: row.manufacturer_name,
    janCode: row.jan_code,
    productName: row.product_name,
    productImage: row.product_image_url || undefined,
    riskClassification: row.risk_classification || '',
    specificIngredients: row.ingredient_names || [],
    catchCopy: row.catch_copy || '',
    productMessage: row.product_message || '',
    productNotes: row.product_notes || undefined,
    width: row.width || 0,
    height: row.height || 0,
    depth: row.depth || 0,
    facingCount: row.facing_count || 1,
    arrivalDate: toDateOnlyString(row.arrival_date),
    hasPromoMaterial: row.has_promo_material ? 'yes' : 'no',
    promoSample: row.promo_sample || undefined,
    specialFixture: row.special_fixture || undefined,
    promoWidth: row.promo_width || undefined,
    promoHeight: row.promo_height || undefined,
    promoDepth: row.promo_depth || undefined,
    promoImage: row.promo_image_url || undefined,
    productAttachments: [],
  }));
};

/**
 * Delete sheets older than cutoff date (retention policy)
 */
export const pruneByRetention = async (cutoffDate: Date): Promise<number> => {
  const result = await db.query(
    `DELETE FROM entry_sheets WHERE created_at < $1`,
    [cutoffDate.toISOString()]
  );
  return result.rowCount;
};

export default {
  findAll,
  countAll,
  findByManufacturerId,
  countByManufacturerId,
  findById,
  upsert,
  addRevision,
  listRevisionsBySheetId,
  searchProductsByManufacturerId,
  updateAdminMemoOnly,
  deleteById,
  pruneByRetention,
};
