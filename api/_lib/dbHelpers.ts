import * as db from './db.js';

/**
 * Database Helper Functions
 *
 * Provides common CRUD operations for PostgreSQL tables.
 * These functions simplify API endpoint implementation.
 */

/**
 * Find a single record by ID
 *
 * @param table - Table name
 * @param id - Record ID
 * @returns Single row or null
 *
 * @example
 * const sheet = await findById('entry_sheets', sheetId);
 */
export const findById = async <T = any>(
  table: string,
  id: string
): Promise<T | null> => {
  const query = `SELECT * FROM ${table} WHERE id = $1`;
  return await db.queryOne<T>(query, [id]);
};

/**
 * Find many records with optional WHERE conditions
 *
 * @param table - Table name
 * @param where - WHERE conditions (e.g., { manufacturer_id: 'xxx' })
 * @param orderBy - ORDER BY clause (e.g., 'created_at DESC')
 * @returns Array of rows
 *
 * @example
 * const sheets = await findMany('entry_sheets', { manufacturer_id: manufacturerId }, 'created_at DESC');
 */
export const findMany = async <T = any>(
  table: string,
  where: Record<string, any> = {},
  orderBy?: string
): Promise<T[]> => {
  const whereKeys = Object.keys(where);
  const whereClauses = whereKeys.map((key, idx) => `${key} = $${idx + 1}`);
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderClause = orderBy ? `ORDER BY ${orderBy}` : '';

  const query = `SELECT * FROM ${table} ${whereClause} ${orderClause}`.trim();
  const params = whereKeys.map((key) => where[key]);

  const result = await db.query<T>(query, params);
  return result.rows;
};

/**
 * Insert a single record
 *
 * @param table - Table name
 * @param data - Record data
 * @returns Inserted row
 *
 * @example
 * const newSheet = await insert('entry_sheets', { id: uuid(), title: '...' });
 */
export const insert = async <T = any>(
  table: string,
  data: Record<string, any>
): Promise<T> => {
  const keys = Object.keys(data);
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map((_, idx) => `$${idx + 1}`);

  const query = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *
  `;

  const result = await db.queryOne<T>(query, values);
  if (!result) {
    throw new Error(`Failed to insert record into ${table}`);
  }
  return result;
};

/**
 * Update a single record by ID
 *
 * @param table - Table name
 * @param id - Record ID
 * @param data - Updated data
 * @returns Updated row or null
 *
 * @example
 * const updated = await updateById('entry_sheets', sheetId, { status: 'completed' });
 */
export const updateById = async <T = any>(
  table: string,
  id: string,
  data: Record<string, any>
): Promise<T | null> => {
  const keys = Object.keys(data);
  const values = keys.map((key) => data[key]);
  const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);

  const query = `
    UPDATE ${table}
    SET ${setClauses.join(', ')}
    WHERE id = $${keys.length + 1}
    RETURNING *
  `;

  return await db.queryOne<T>(query, [...values, id]);
};

/**
 * Delete a single record by ID
 *
 * @param table - Table name
 * @param id - Record ID
 * @returns true if deleted, false if not found
 *
 * @example
 * const deleted = await deleteById('entry_sheets', sheetId);
 */
export const deleteById = async (table: string, id: string): Promise<boolean> => {
  const query = `DELETE FROM ${table} WHERE id = $1`;
  const result = await db.query(query, [id]);
  return result.rowCount > 0;
};

/**
 * Count records with optional WHERE conditions
 *
 * @param table - Table name
 * @param where - WHERE conditions
 * @returns Record count
 *
 * @example
 * const count = await count('entry_sheets', { manufacturer_id: manufacturerId });
 */
export const count = async (
  table: string,
  where: Record<string, any> = {}
): Promise<number> => {
  const whereKeys = Object.keys(where);
  const whereClauses = whereKeys.map((key, idx) => `${key} = $${idx + 1}`);
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`.trim();
  const params = whereKeys.map((key) => where[key]);

  const result = await db.queryOne<{ count: string }>(query, params);
  return result ? parseInt(result.count, 10) : 0;
};

/**
 * Execute a raw SQL query (for complex queries)
 *
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Query result
 */
export const raw = db.query;

/**
 * Execute a transaction
 */
export const transaction = db.transaction;

export default {
  findById,
  findMany,
  insert,
  updateById,
  deleteById,
  count,
  raw,
  transaction,
};
