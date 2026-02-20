import * as db from '../db.js';
import { EntrySheet, ProductEntry, Attachment } from '../types.js';
import { ensureManufacturer } from './users.js';
import { randomUUID } from 'crypto';

/**
 * Sheet Repository
 *
 * Handles all database operations for entry_sheets, product_entries, and related tables.
 */

interface SheetRow {
  id: string;
  creator_id: string;
  creator_name: string;
  manufacturer_id: string;
  manufacturer_name: string;
  creator_email: string;
  creator_phone: string;
  title: string;
  notes: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
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
const rowsToSheet = async (
  sheetRow: SheetRow,
  productRows: ProductRow[],
  ingredientRows: IngredientRow[],
  attachmentRows: AttachmentRow[]
): Promise<EntrySheet> => {
  const products: ProductEntry[] = productRows.map((p) => {
    const ingredients = ingredientRows
      .filter((i) => i.product_id === p.id)
      .map((i) => i.ingredient_name);

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
    };
  });

  const attachments: Attachment[] = attachmentRows
    .filter((a) => a.sheet_id === sheetRow.id && !a.product_id)
    .map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      url: a.url,
    }));

  return {
    id: sheetRow.id,
    creatorId: sheetRow.creator_id,
    creatorName: sheetRow.creator_name,
    manufacturerName: sheetRow.manufacturer_name,
    email: sheetRow.creator_email,
    phoneNumber: sheetRow.creator_phone,
    title: sheetRow.title,
    notes: sheetRow.notes || undefined,
    status: sheetRow.status as 'draft' | 'completed',
    createdAt: toIsoString(sheetRow.created_at),
    updatedAt: toIsoString(sheetRow.updated_at),
    products,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
};

/**
 * Get all sheets (for ADMIN)
 */
export const findAll = async (): Promise<EntrySheet[]> => {
  const sheetResult = await db.query<SheetRow>(
    `
    SELECT
      s.id, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.created_at, s.updated_at,
      u.display_name as creator_name,
      u.email as creator_email,
      u.phone_number as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    JOIN users u ON s.creator_id = u.id
    JOIN manufacturers m ON s.manufacturer_id = m.id
    ORDER BY s.created_at DESC
    `
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
      `SELECT * FROM attachments WHERE sheet_id = ANY($1)`,
      [sheetIds]
    ),
  ]);

  const sheets = await Promise.all(
    sheetResult.rows.map((sheetRow) => {
      const productRows = productResult.rows.filter((p) => p.sheet_id === sheetRow.id);
      return rowsToSheet(sheetRow, productRows, ingredientResult.rows, attachmentResult.rows);
    })
  );

  return sheets;
};

/**
 * Get sheets by manufacturer ID (for STAFF)
 */
export const findByManufacturerId = async (manufacturerId: string): Promise<EntrySheet[]> => {
  const sheetResult = await db.query<SheetRow>(
    `
    SELECT
      s.id, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.created_at, s.updated_at,
      u.display_name as creator_name,
      u.email as creator_email,
      u.phone_number as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    JOIN users u ON s.creator_id = u.id
    JOIN manufacturers m ON s.manufacturer_id = m.id
    WHERE s.manufacturer_id = $1
    ORDER BY s.created_at DESC
    `,
    [manufacturerId]
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
      `SELECT * FROM attachments WHERE sheet_id = ANY($1)`,
      [sheetIds]
    ),
  ]);

  const sheets = await Promise.all(
    sheetResult.rows.map((sheetRow) => {
      const productRows = productResult.rows.filter((p) => p.sheet_id === sheetRow.id);
      return rowsToSheet(sheetRow, productRows, ingredientResult.rows, attachmentResult.rows);
    })
  );

  return sheets;
};

/**
 * Get single sheet by ID
 */
export const findById = async (sheetId: string): Promise<EntrySheet | null> => {
  const sheetResult = await db.query<SheetRow>(
    `
    SELECT
      s.id, s.creator_id, s.manufacturer_id, s.title, s.notes, s.status,
      s.created_at, s.updated_at,
      u.display_name as creator_name,
      u.email as creator_email,
      u.phone_number as creator_phone,
      m.name as manufacturer_name
    FROM entry_sheets s
    JOIN users u ON s.creator_id = u.id
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
    db.query<AttachmentRow>(`SELECT * FROM attachments WHERE sheet_id = $1`, [sheetId]),
  ]);

  return rowsToSheet(
    sheetResult.rows[0],
    productResult.rows,
    ingredientResult.rows,
    attachmentResult.rows
  );
};

/**
 * Upsert sheet with products (transactional)
 */
export const upsert = async (sheet: EntrySheet): Promise<EntrySheet> => {
  return await db.transaction(async () => {
    const manufacturerId = await ensureManufacturer(sheet.manufacturerName);

    // Upsert entry_sheet
    await db.query(
      `
      INSERT INTO entry_sheets (
        id, creator_id, manufacturer_id, title, notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        notes = EXCLUDED.notes,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
      `,
      [
        sheet.id,
        sheet.creatorId,
        manufacturerId,
        sheet.title,
        sheet.notes || null,
        sheet.status,
        sheet.createdAt,
        new Date().toISOString(),
      ]
    );

    // Delete existing products (CASCADE will handle ingredients)
    await db.query(`DELETE FROM product_entries WHERE sheet_id = $1`, [sheet.id]);

    // Insert products
    const usedProductIds = new Set<string>();
    for (const product of sheet.products) {
      const productManufacturerId = await ensureManufacturer(product.manufacturerName);
      let productId = product.id || randomUUID();

      // Ensure product ID uniqueness within this save request and across sheets.
      while (usedProductIds.has(productId)) {
        productId = randomUUID();
      }
      while (true) {
        const existing = await db.query<{ sheet_id: string }>(
          `SELECT sheet_id FROM product_entries WHERE id = $1 LIMIT 1`,
          [productId]
        );
        if (existing.rows.length === 0 || existing.rows[0].sheet_id === sheet.id) {
          break;
        }
        productId = randomUUID();
      }
      usedProductIds.add(productId);

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
        `,
        [
          productId,
          sheet.id,
          product.shelfName,
          productManufacturerId,
          product.janCode,
          product.productName,
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

      // Insert ingredients
      if (product.specificIngredients && product.specificIngredients.length > 0) {
        for (const ingredient of product.specificIngredients) {
          await db.query(
            `INSERT INTO product_ingredients (product_id, ingredient_name) VALUES ($1, $2)`,
            [productId, ingredient]
          );
        }
      }
    }

    // Delete existing attachments
    await db.query(`DELETE FROM attachments WHERE sheet_id = $1`, [sheet.id]);

    // Insert attachments
    if (sheet.attachments && sheet.attachments.length > 0) {
      for (const attachment of sheet.attachments) {
        await db.query(
          `INSERT INTO attachments (sheet_id, name, size, type, url) VALUES ($1, $2, $3, $4, $5)`,
          [sheet.id, attachment.name, attachment.size, attachment.type, attachment.url]
        );
      }
    }

    // Return saved sheet
    const saved = await findById(sheet.id);
    if (!saved) throw new Error('Failed to save sheet');
    return saved;
  });
};

/**
 * Delete sheet by ID
 */
export const deleteById = async (sheetId: string): Promise<boolean> => {
  const result = await db.query(`DELETE FROM entry_sheets WHERE id = $1`, [sheetId]);
  return result.rowCount > 0;
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
  findByManufacturerId,
  findById,
  upsert,
  deleteById,
  pruneByRetention,
};
