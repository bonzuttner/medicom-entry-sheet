import * as db from '../db.js';
import { FaceOption, MasterData } from '../types.js';
import { ensureManufacturer } from './users.js';

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

interface ManufacturerShelfNameRow {
  manufacturer_name: string;
  shelf_name: string;
  display_order: number;
}

interface ManufacturerCaseNameRow {
  manufacturer_name: string;
  case_name: string;
  display_order: number;
}

interface ManufacturerDefaultStartMonthRow {
  manufacturer_name: string;
  month: number;
  display_order: number;
}

interface ManufacturerFaceOptionRow {
  manufacturer_name: string;
  face_label: string;
  max_width: number;
  display_order: number;
}

let ensureManufacturerShelfTablePromise: Promise<void> | null = null;
let ensureManufacturerCaseTablePromise: Promise<void> | null = null;
let ensureManufacturerDefaultStartMonthsTablePromise: Promise<void> | null = null;
let ensureManufacturerFaceOptionsTablePromise: Promise<void> | null = null;

const ensureManufacturerShelfTable = async (): Promise<void> => {
  if (!ensureManufacturerShelfTablePromise) {
    ensureManufacturerShelfTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS manufacturer_shelf_names (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
          shelf_name VARCHAR(200) NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (manufacturer_id, shelf_name)
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_manufacturer_shelf_names_manufacturer
        ON manufacturer_shelf_names(manufacturer_id, display_order)
        `
      );
    })().catch((error) => {
      ensureManufacturerShelfTablePromise = null;
      throw error;
    });
  }
  await ensureManufacturerShelfTablePromise;
};

const ensureManufacturerCaseTable = async (): Promise<void> => {
  if (!ensureManufacturerCaseTablePromise) {
    ensureManufacturerCaseTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS manufacturer_case_names (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
          case_name VARCHAR(200) NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (manufacturer_id, case_name)
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_manufacturer_case_names_manufacturer
        ON manufacturer_case_names(manufacturer_id, display_order)
        `
      );
    })().catch((error) => {
      ensureManufacturerCaseTablePromise = null;
      throw error;
    });
  }
  await ensureManufacturerCaseTablePromise;
};

const ensureManufacturerDefaultStartMonthsTable = async (): Promise<void> => {
  if (!ensureManufacturerDefaultStartMonthsTablePromise) {
    ensureManufacturerDefaultStartMonthsTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS manufacturer_default_start_months (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
          month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (manufacturer_id, month)
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_manufacturer_default_start_months_manufacturer
        ON manufacturer_default_start_months(manufacturer_id, display_order)
        `
      );
    })().catch((error) => {
      ensureManufacturerDefaultStartMonthsTablePromise = null;
      throw error;
    });
  }
  await ensureManufacturerDefaultStartMonthsTablePromise;
};

const ensureManufacturerFaceOptionsTable = async (): Promise<void> => {
  if (!ensureManufacturerFaceOptionsTablePromise) {
    ensureManufacturerFaceOptionsTablePromise = (async () => {
      await db.query(
        `
        CREATE TABLE IF NOT EXISTS manufacturer_face_options (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          manufacturer_id UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
          face_label VARCHAR(50) NOT NULL,
          max_width INTEGER NOT NULL CHECK (max_width > 0),
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (manufacturer_id, face_label)
        )
        `
      );
      await db.query(
        `
        CREATE INDEX IF NOT EXISTS idx_manufacturer_face_options_manufacturer
        ON manufacturer_face_options(manufacturer_id, display_order)
        `
      );
    })().catch((error) => {
      ensureManufacturerFaceOptionsTablePromise = null;
      throw error;
    });
  }
  await ensureManufacturerFaceOptionsTablePromise;
};

const MASTER_CATEGORY = {
  manufacturerNames: 'manufacturer_name',
  shelfNames: 'shelf_name',
  riskClassifications: 'risk_classification',
  specificIngredients: 'specific_ingredient',
} as const;

type MasterListKey = keyof typeof MASTER_CATEGORY;

const LEGACY_CATEGORY_VALUES = {
  manufacturerNames: ['manufacturer_name', 'manufacturerNames'],
  shelfNames: ['shelf_name', 'shelfNames'],
  riskClassifications: ['risk_classification', 'riskClassifications'],
  specificIngredients: ['specific_ingredient', 'specificIngredients'],
} as const satisfies Record<MasterListKey, string[]>;

const LEGACY_CATEGORY_ALIASES: Record<string, MasterListKey> = {
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
    caseNames: [],
    riskClassifications,
    specificIngredients,
    manufacturerFaceOptions: {},
  };
};

export const getManufacturerShelfNamesMap = async (): Promise<Record<string, string[]>> => {
  await ensureManufacturerShelfTable();
  const result = await db.query<ManufacturerShelfNameRow>(
    `
    SELECT m.name as manufacturer_name, msn.shelf_name, msn.display_order
    FROM manufacturer_shelf_names msn
    JOIN manufacturers m ON msn.manufacturer_id = m.id
    ORDER BY m.name, msn.display_order
    `
  );

  const map: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!map[row.manufacturer_name]) {
      map[row.manufacturer_name] = [];
    }
    map[row.manufacturer_name].push(row.shelf_name);
  }
  return map;
};

export const getManufacturerCaseNamesMap = async (): Promise<Record<string, string[]>> => {
  await ensureManufacturerCaseTable();
  const result = await db.query<ManufacturerCaseNameRow>(
    `
    SELECT m.name as manufacturer_name, mcn.case_name, mcn.display_order
    FROM manufacturer_case_names mcn
    JOIN manufacturers m ON mcn.manufacturer_id = m.id
    ORDER BY m.name, mcn.display_order
    `
  );

  const map: Record<string, string[]> = {};
  for (const row of result.rows) {
    if (!map[row.manufacturer_name]) {
      map[row.manufacturer_name] = [];
    }
    map[row.manufacturer_name].push(row.case_name);
  }
  return map;
};

export const getManufacturerDefaultStartMonthsMap = async (): Promise<Record<string, number[]>> => {
  await ensureManufacturerDefaultStartMonthsTable();
  const result = await db.query<ManufacturerDefaultStartMonthRow>(
    `
    SELECT m.name as manufacturer_name, d.month, d.display_order
    FROM manufacturer_default_start_months d
    JOIN manufacturers m ON d.manufacturer_id = m.id
    ORDER BY m.name, d.display_order
    `
  );

  const map: Record<string, number[]> = {};
  for (const row of result.rows) {
    if (!map[row.manufacturer_name]) {
      map[row.manufacturer_name] = [];
    }
    map[row.manufacturer_name].push(row.month);
  }
  return map;
};

export const getManufacturerFaceOptionsMap = async (): Promise<Record<string, FaceOption[]>> => {
  await ensureManufacturerFaceOptionsTable();
  const result = await db.query<ManufacturerFaceOptionRow>(
    `
    SELECT m.name as manufacturer_name, f.face_label, f.max_width, f.display_order
    FROM manufacturer_face_options f
    JOIN manufacturers m ON f.manufacturer_id = m.id
    ORDER BY m.name, f.display_order
    `
  );

  const map: Record<string, FaceOption[]> = {};
  for (const row of result.rows) {
    if (!map[row.manufacturer_name]) {
      map[row.manufacturer_name] = [];
    }
    map[row.manufacturer_name].push({
      label: row.face_label,
      maxWidth: row.max_width,
    });
  }
  return map;
};

export const getFaceOptionsByManufacturerName = async (
  manufacturerName: string
): Promise<FaceOption[]> => {
  await ensureManufacturerFaceOptionsTable();
  const result = await db.query<{ face_label: string; max_width: number; display_order: number }>(
    `
    SELECT f.face_label, f.max_width, f.display_order
    FROM manufacturer_face_options f
    JOIN manufacturers m ON f.manufacturer_id = m.id
    WHERE m.name = $1
    ORDER BY f.display_order
    `,
    [manufacturerName]
  );
  return result.rows.map((row) => ({
    label: row.face_label,
    maxWidth: row.max_width,
  }));
};

export const getShelfNamesByManufacturerName = async (
  manufacturerName: string
): Promise<string[]> => {
  await ensureManufacturerShelfTable();
  const result = await db.query<{ shelf_name: string; display_order: number }>(
    `
    SELECT msn.shelf_name, msn.display_order
    FROM manufacturer_shelf_names msn
    JOIN manufacturers m ON msn.manufacturer_id = m.id
    WHERE m.name = $1
    ORDER BY msn.display_order
    `,
    [manufacturerName]
  );
  return result.rows.map((row) => row.shelf_name);
};

export const getCaseNamesByManufacturerName = async (
  manufacturerName: string
): Promise<string[]> => {
  await ensureManufacturerCaseTable();
  const result = await db.query<{ case_name: string; display_order: number }>(
    `
    SELECT mcn.case_name, mcn.display_order
    FROM manufacturer_case_names mcn
    JOIN manufacturers m ON mcn.manufacturer_id = m.id
    WHERE m.name = $1
    ORDER BY mcn.display_order
    `,
    [manufacturerName]
  );
  return result.rows.map((row) => row.case_name);
};

export const updateManufacturerShelfNamesMap = async (
  nextMap: Record<string, string[]>
): Promise<void> => {
  await ensureManufacturerShelfTable();
  await db.transaction(async () => {
    for (const [manufacturerName, values] of Object.entries(nextMap)) {
      const normalizedManufacturerName = String(manufacturerName || '').trim();
      if (!normalizedManufacturerName) continue;

      const manufacturerId = await ensureManufacturer(normalizedManufacturerName);
      const desired = [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];

      await db.query(
        `DELETE FROM manufacturer_shelf_names WHERE manufacturer_id = $1`,
        [manufacturerId]
      );

      if (desired.length > 0) {
        await db.query(
          `
          INSERT INTO manufacturer_shelf_names (manufacturer_id, shelf_name, display_order)
          SELECT
            $1,
            items.value,
            (items.ord - 1)::int
          FROM unnest($2::text[]) WITH ORDINALITY AS items(value, ord)
          `,
          [manufacturerId, desired]
        );
      }
    }
  });
};

export const updateManufacturerCaseNamesMap = async (
  nextMap: Record<string, string[]>
): Promise<void> => {
  await ensureManufacturerCaseTable();
  await db.transaction(async () => {
    for (const [manufacturerName, values] of Object.entries(nextMap)) {
      const normalizedManufacturerName = String(manufacturerName || '').trim();
      if (!normalizedManufacturerName) continue;

      const manufacturerId = await ensureManufacturer(normalizedManufacturerName);
      const desired = [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];

      await db.query(`DELETE FROM manufacturer_case_names WHERE manufacturer_id = $1`, [
        manufacturerId,
      ]);

      if (desired.length > 0) {
        await db.query(
          `
          INSERT INTO manufacturer_case_names (manufacturer_id, case_name, display_order)
          SELECT
            $1,
            items.value,
            (items.ord - 1)::int
          FROM unnest($2::text[]) WITH ORDINALITY AS items(value, ord)
          `,
          [manufacturerId, desired]
        );
      }
    }
  });
};

export const updateManufacturerDefaultStartMonthsMap = async (
  nextMap: Record<string, number[]>
): Promise<void> => {
  await ensureManufacturerDefaultStartMonthsTable();
  await db.transaction(async () => {
    for (const [manufacturerName, values] of Object.entries(nextMap)) {
      const normalizedManufacturerName = String(manufacturerName || '').trim();
      if (!normalizedManufacturerName) continue;

      const manufacturerId = await ensureManufacturer(normalizedManufacturerName);
      const desired = [...new Set(
        values
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v >= 1 && v <= 12)
      )];

      await db.query(
        `DELETE FROM manufacturer_default_start_months WHERE manufacturer_id = $1`,
        [manufacturerId]
      );

      if (desired.length > 0) {
        await db.query(
          `
          INSERT INTO manufacturer_default_start_months (manufacturer_id, month, display_order)
          SELECT
            $1,
            items.value::smallint,
            (items.ord - 1)::int
          FROM unnest($2::int[]) WITH ORDINALITY AS items(value, ord)
          `,
          [manufacturerId, desired]
        );
      }
    }
  });
};

export const updateManufacturerFaceOptionsMap = async (
  nextMap: Record<string, FaceOption[]>
): Promise<void> => {
  await ensureManufacturerFaceOptionsTable();
  await db.transaction(async () => {
    for (const [manufacturerName, values] of Object.entries(nextMap)) {
      const normalizedManufacturerName = String(manufacturerName || '').trim();
      if (!normalizedManufacturerName) continue;

      const manufacturerId = await ensureManufacturer(normalizedManufacturerName);
      const desired = values
        .map((item) => ({
          label: String(item?.label || '').trim(),
          maxWidth: Number(item?.maxWidth),
        }))
        .filter(
          (item, index, source) =>
            item.label &&
            Number.isInteger(item.maxWidth) &&
            item.maxWidth > 0 &&
            source.findIndex((candidate) => candidate.label === item.label) === index
        );

      await db.query(`DELETE FROM manufacturer_face_options WHERE manufacturer_id = $1`, [
        manufacturerId,
      ]);

      for (let index = 0; index < desired.length; index += 1) {
        await db.query(
          `
          INSERT INTO manufacturer_face_options (
            manufacturer_id, face_label, max_width, display_order
          ) VALUES ($1, $2, $3, $4)
          `,
          [manufacturerId, desired[index].label, desired[index].maxWidth, index]
        );
      }
    }
  });
};

/**
 * Update all master data (diff strategy)
 */
export const updateAll = async (masterData: MasterData): Promise<MasterData> => {
  const normalizedData: MasterData = {
    manufacturerNames: [...new Set(masterData.manufacturerNames.map((v) => v.trim()).filter(Boolean))],
    shelfNames: [...new Set(masterData.shelfNames.map((v) => v.trim()).filter(Boolean))],
    caseNames: [...new Set((masterData.caseNames || []).map((v) => v.trim()).filter(Boolean))],
    riskClassifications: [
      ...new Set(masterData.riskClassifications.map((v) => v.trim()).filter(Boolean)),
    ],
    specificIngredients: [
      ...new Set(masterData.specificIngredients.map((v) => v.trim()).filter(Boolean)),
    ],
    manufacturerFaceOptions: masterData.manufacturerFaceOptions || {},
  };

  const syncCategory = async (
    key: MasterListKey,
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
  getManufacturerShelfNamesMap,
  getManufacturerCaseNamesMap,
  getManufacturerDefaultStartMonthsMap,
  getManufacturerFaceOptionsMap,
  getShelfNamesByManufacturerName,
  getCaseNamesByManufacturerName,
  getFaceOptionsByManufacturerName,
  updateManufacturerShelfNamesMap,
  updateManufacturerCaseNamesMap,
  updateManufacturerDefaultStartMonthsMap,
  updateManufacturerFaceOptionsMap,
  updateAll,
  addValue,
  removeValue,
};
