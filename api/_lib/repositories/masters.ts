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
    switch (row.category) {
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
 * Update all master data (replace strategy)
 */
export const updateAll = async (masterData: MasterData): Promise<MasterData> => {
  await db.transaction(async () => {
    // Delete all existing data
    await db.query(`DELETE FROM master_data`);

    // Insert new data
    const inserts: Promise<any>[] = [];

    masterData.manufacturerNames.forEach((value, index) => {
      inserts.push(
        db.query(
          `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
          ['manufacturerNames', value, index]
        )
      );
    });

    masterData.shelfNames.forEach((value, index) => {
      inserts.push(
        db.query(
          `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
          ['shelfNames', value, index]
        )
      );
    });

    masterData.riskClassifications.forEach((value, index) => {
      inserts.push(
        db.query(
          `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
          ['riskClassifications', value, index]
        )
      );
    });

    masterData.specificIngredients.forEach((value, index) => {
      inserts.push(
        db.query(
          `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
          ['specificIngredients', value, index]
        )
      );
    });

    await Promise.all(inserts);
  });

  return await getAll();
};

/**
 * Add a single value to a category
 */
export const addValue = async (category: string, value: string): Promise<void> => {
  const maxOrderResult = await db.query<{ max_order: number | null }>(
    `SELECT MAX(display_order) as max_order FROM master_data WHERE category = $1`,
    [category]
  );

  const nextOrder = (maxOrderResult.rows[0]?.max_order || -1) + 1;

  await db.query(
    `INSERT INTO master_data (category, value, display_order) VALUES ($1, $2, $3)`,
    [category, value, nextOrder]
  );
};

/**
 * Remove a single value from a category
 */
export const removeValue = async (category: string, value: string): Promise<void> => {
  await db.query(`DELETE FROM master_data WHERE category = $1 AND value = $2`, [category, value]);
};

export default {
  getAll,
  updateAll,
  addValue,
  removeValue,
};
