import * as db from '../db.js';

export interface RetailerAssignment {
  manufacturerId: string;
  manufacturerName: string;
}

export const getAssignedManufacturers = async (
  retailerUserId: string
): Promise<RetailerAssignment[]> => {
  const result = await db.query<{
    manufacturer_id: string;
    manufacturer_name: string;
  }>(
    `SELECT
      rma.manufacturer_id,
      m.name AS manufacturer_name
    FROM retailer_manufacturer_assignments rma
    JOIN manufacturers m ON m.id = rma.manufacturer_id
    WHERE rma.retailer_user_id = $1
    ORDER BY m.name`,
    [retailerUserId]
  );
  return result.rows.map((row) => ({
    manufacturerId: row.manufacturer_id,
    manufacturerName: row.manufacturer_name,
  }));
};

export const getAssignedManufacturerIds = async (
  retailerUserId: string
): Promise<string[]> => {
  const result = await db.query<{ manufacturer_id: string }>(
    `SELECT manufacturer_id
    FROM retailer_manufacturer_assignments
    WHERE retailer_user_id = $1`,
    [retailerUserId]
  );
  return result.rows.map((row) => row.manufacturer_id);
};

export const setAssignedManufacturers = async (
  retailerUserId: string,
  manufacturerIds: string[]
): Promise<void> => {
  // Delete existing assignments
  await db.query(
    `DELETE FROM retailer_manufacturer_assignments
    WHERE retailer_user_id = $1`,
    [retailerUserId]
  );

  // Insert new assignments
  if (manufacturerIds.length > 0) {
    for (const manufacturerId of manufacturerIds) {
      await db.query(
        `INSERT INTO retailer_manufacturer_assignments (retailer_user_id, manufacturer_id)
        VALUES ($1, $2)
        ON CONFLICT (retailer_user_id, manufacturer_id) DO NOTHING`,
        [retailerUserId, manufacturerId]
      );
    }
  }
};

export const addAssignment = async (
  retailerUserId: string,
  manufacturerId: string
): Promise<void> => {
  await db.query(
    `INSERT INTO retailer_manufacturer_assignments (retailer_user_id, manufacturer_id)
    VALUES ($1, $2)
    ON CONFLICT (retailer_user_id, manufacturer_id) DO NOTHING`,
    [retailerUserId, manufacturerId]
  );
};

export const removeAssignment = async (
  retailerUserId: string,
  manufacturerId: string
): Promise<void> => {
  await db.query(
    `DELETE FROM retailer_manufacturer_assignments
    WHERE retailer_user_id = $1
    AND manufacturer_id = $2`,
    [retailerUserId, manufacturerId]
  );
};
