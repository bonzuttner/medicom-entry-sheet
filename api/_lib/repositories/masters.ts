import * as db from '../db.js';
import { MasterData } from '../types.js';

/**
 * Master Repository
 *
 * Handles all database operations for master_data table.
 */

interface MasterRow {
  category: string;
  value: string;
  display_order: number;
}

const MASTER_CATEGORY = {
  manufacturerNames: 'manufacturer_name',
  shelfNames: 'shelf_name',
  riskClassifications: 'risk_classification',
  specificIngredients: 'specific_ingredient',
} as const;

const LEGACY_CATEGORY_VALUES = {
  manufacturerNames: ['manufacturer_name', 'manufacturerNames'],
  shelfNames: ['shelf_name', 'shelfNames'],
  riskClassifications: ['risk_classification', 'riskClassifications'],
  specificIngredients: ['specific_ingredient', 'specificIngredients'],
} as const;

const LEGACY_CATEGORY_ALIASES: Record<string, keyof MasterData> = {
  manufacturerNames: 'manufacturerNames',
  shelfNames: 'shelfNames',
  riskClassifications: 'riskClassifications',
  specificIngredients: 'specificIngredients',
  manufacturer_name: 'manufacturerNames',
  shelf_name: 'shelfNames',
  risk_classification: 'riskClassifications',
  specific_ingredient: 'specificIngredients',
};

const toCanonicalCategory = (category: string): string | null => {
  const key = LEGACY_CATEGORY_ALIASES[category];
  if (!key) return null;
  return MASTER_CATEGORY[key];
};

/**
 * Get all master data
 */
export const getAll = async (): Promise<MasterData> => {
  const result = await db.query<MasterRow>(
    `SELECT category, value, display_order FROM master_data ORDER BY category, display_order`
  );

  const manufacturerNames: string[] = [];
  const shelfNames: string[] = [];
  const riskClassifications: string[] = [];
  const specificIngredients: string[] = [];

  for (const row of result.rows) {
    const normalizedCategory = LEGACY_CATEGORY_ALIASES[row.category];
    switch (normalizedCategory) {
      case 'manufacturerNames':
        manufacturerNames.push(row.value);
        break;
      case 'shelfNames':
        shelfNames.push(row.value);
        break;
      case 'riskClassifications':
        riskClassifications.push(row.value);
        break;
      case 'specificIngredients':
        specificIngredients.push(row.value);
        break;
      default:
        break;
    }
  }

  return {
    manufacturerNames,
    shelfNames,
    riskClassifications,
    specificIngredients,
  };
};

/**
 * Update all master data (diff strategy)
 */
export const updateAll = async (masterData: MasterData): Promise<MasterData> => {
  const normalizedData: MasterData = {
    manufacturerNames: [...new Set(masterData.manufacturerNames.map((v) => v.trim()).filter(Boolean))],
    shelfNames: [...new Set(masterData.shelfNames.map((v) => v.trim()).filter(Boolean))],
    riskClassifications: [
      ...new Set(masterData.riskClassifications.map((v) => v.trim()).filter(Boolean)),
    ],
    specificIngredients: [
      ...new Set(masterData.specificIngredients.map((v) => v.trim()).filter(Boolean)),
    ],
  };

  const syncCategory = async (
    key: keyof MasterData,
    categoryValue: string
  ): Promise<void> => {
    const aliases = LEGACY_CATEGORY_VALUES[key];
    const desired = normalizedData[key];

    // Clean up rows no longer present
    await db.query(
      `
      DELETE FROM master_data
      WHERE category = ANY($1)
      AND NOT (value = ANY($2))
      `,
      [aliases, desired.length > 0 ? desired : ['__EMPTY__']]
    );

    // Upsert desired rows with correct order/category in a single query.
    if (desired.length > 0) {
      await db.query(
        `
        INSERT INTO master_data (category, value, display_order)
        SELECT
          $1,
          items.value,
          (items.ord - 1)::int
        FROM unnest($2::text[]) WITH ORDINALITY AS items(value, ord)
        ON CONFLICT (category, value) DO UPDATE
        SET display_order = EXCLUDED.display_order
        `,
        [categoryValue, desired]
      );
    }

    // Migrate legacy category rows to canonical category where value overlaps
    await db.query(
      `
      DELETE FROM master_data legacy
      USING master_data canonical
      WHERE legacy.category = ANY($1)
      AND legacy.category != $2
      AND canonical.category = $2
      AND legacy.value = canonical.value
      `,
      [aliases, categoryValue]
    );
  };

  await db.transaction(async () => {
    await syncCategory('manufacturerNames', MASTER_CATEGORY.manufacturerNames);
    await syncCategory('shelfNames', MASTER_CATEGORY.shelfNames);
    await syncCategory('riskClassifications', MASTER_CATEGORY.riskClassifications);
    await syncCategory('specificIngredients', MASTER_CATEGORY.specificIngredients);
  });

  return await getAll();
};

/**
 * Add a single value to a category
 */
export const addValue = async (category: string, value: string): Promise<void> => {
  const canonicalCategory = toCanonicalCategory(category);
  if (!canonicalCategory) {
    throw new Error(`Unsupported master category: ${category}`);
  }

  const maxOrderResult = await db.query<{ max_order: number | null }>(
    `SELECT MAX(display_order) as max_order FROM master_data WHERE category = $1`,
    [canonicalCategory]
  );

  const nextOrder = (maxOrderResult.rows[0]?.max_order || -1) + 1;

  await db.query(
    `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
    [canonicalCategory, value.trim(), nextOrder]
  );
};

/**
 * Remove a single value from a category
 */
export const removeValue = async (category: string, value: string): Promise<void> => {
  const canonicalCategory = toCanonicalCategory(category);
  if (!canonicalCategory) {
    throw new Error(`Unsupported master category: ${category}`);
  }

  await db.query(
    `DELETE FROM master_data WHERE category = $1 AND value = $2`,
    [canonicalCategory, value.trim()]
  );
};

export default {
  getAll,
  updateAll,
  addValue,
  removeValue,
};
