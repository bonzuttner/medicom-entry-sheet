import * as db from '../db.js';
import { User } from '../types.js';

/**
 * User Repository
 *
 * Handles all database operations for users table.
 */

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  manufacturer_id: string;
  manufacturer_name: string;
  email: string;
  phone_number: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

const rowToUser = (row: UserRow): User => ({
  id: row.id,
  username: row.username,
  password: row.password_hash,
  displayName: row.display_name,
  manufacturerName: row.manufacturer_name,
  email: row.email,
  phoneNumber: row.phone_number,
  role: row.role as 'ADMIN' | 'STAFF',
});

/**
 * Find user by ID
 */
export const findById = async (userId: string): Promise<User | null> => {
  const result = await db.query<UserRow>(
    `
    SELECT u.*, m.name as manufacturer_name
    FROM users u
    JOIN manufacturers m ON u.manufacturer_id = m.id
    WHERE u.id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
};

/**
 * Find user by username (for login)
 */
export const findByUsername = async (username: string): Promise<User | null> => {
  const result = await db.query<UserRow>(
    `
    SELECT u.*, m.name as manufacturer_name
    FROM users u
    JOIN manufacturers m ON u.manufacturer_id = m.id
    WHERE u.username = $1
    `,
    [username]
  );

  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
};

/**
 * Get all users (for ADMIN)
 */
export const findAll = async (): Promise<User[]> => {
  const result = await db.query<UserRow>(
    `
    SELECT u.*, m.name as manufacturer_name
    FROM users u
    JOIN manufacturers m ON u.manufacturer_id = m.id
    ORDER BY u.created_at DESC
    `
  );

  return result.rows.map(rowToUser);
};

/**
 * Get users by manufacturer ID (for STAFF)
 */
export const findByManufacturerId = async (manufacturerId: string): Promise<User[]> => {
  const result = await db.query<UserRow>(
    `
    SELECT u.*, m.name as manufacturer_name
    FROM users u
    JOIN manufacturers m ON u.manufacturer_id = m.id
    WHERE u.manufacturer_id = $1
    ORDER BY u.created_at DESC
    `,
    [manufacturerId]
  );

  return result.rows.map(rowToUser);
};

/**
 * Get manufacturer ID by user ID
 */
export const getManufacturerIdByUserId = async (userId: string): Promise<string | null> => {
  const result = await db.query<{ manufacturer_id: string }>(
    `SELECT manufacturer_id FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].manufacturer_id;
};

/**
 * Get manufacturer ID by name
 */
export const getManufacturerId = async (manufacturerName: string): Promise<string | null> => {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM manufacturers WHERE name = $1`,
    [manufacturerName]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].id;
};

/**
 * Get manufacturer ID by name, creating it when missing.
 */
export const getOrCreateManufacturerId = async (manufacturerName: string): Promise<string> => {
  const existingId = await getManufacturerId(manufacturerName);
  if (existingId) return existingId;
  return ensureManufacturer(manufacturerName);
};

/**
 * Ensure manufacturer exists, create if not
 * Thread-safe: uses ON CONFLICT to handle concurrent inserts
 */
export const ensureManufacturer = async (manufacturerName: string): Promise<string> => {
  const result = await db.query<{ id: string }>(
    `INSERT INTO manufacturers (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [manufacturerName]
  );

  return result.rows[0].id;
};

/**
 * Upsert a single user
 */
export const upsert = async (user: User): Promise<User> => {
  const manufacturerId = await ensureManufacturer(user.manufacturerName);

  const result = await db.query<UserRow>(
    `
    INSERT INTO users (
      id, username, password_hash, display_name, manufacturer_id,
      email, phone_number, role, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      display_name = EXCLUDED.display_name,
      manufacturer_id = EXCLUDED.manufacturer_id,
      email = EXCLUDED.email,
      phone_number = EXCLUDED.phone_number,
      role = EXCLUDED.role,
      updated_at = NOW()
    RETURNING
      id, username, password_hash, display_name, manufacturer_id,
      email, phone_number, role, created_at, updated_at,
      (SELECT name FROM manufacturers WHERE id = manufacturer_id) as manufacturer_name
    `,
    [
      user.id,
      user.username,
      user.password,
      user.displayName,
      manufacturerId,
      user.email,
      user.phoneNumber,
      user.role,
    ]
  );

  return rowToUser(result.rows[0]);
};

/**
 * Upsert multiple users (for bulk operations)
 */
export const upsertMany = async (users: User[]): Promise<User[]> => {
  const results: User[] = [];

  await db.transaction(async () => {
    for (const user of users) {
      const saved = await upsert(user);
      results.push(saved);
    }
  });

  return results;
};

/**
 * Delete user by ID
 */
export const deleteById = async (userId: string): Promise<boolean> => {
  const result = await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
  return result.rowCount > 0;
};

/**
 * Check if username is already taken (excluding specific user ID)
 */
export const isUsernameTaken = async (
  username: string,
  excludeUserId?: string
): Promise<boolean> => {
  const result = await db.query<{ count: string }>(
    excludeUserId
      ? `SELECT COUNT(*) as count FROM users WHERE username = $1 AND id != $2`
      : `SELECT COUNT(*) as count FROM users WHERE username = $1`,
    excludeUserId ? [username, excludeUserId] : [username]
  );

  return parseInt(result.rows[0].count, 10) > 0;
};

export default {
  findById,
  findByUsername,
  findAll,
  findByManufacturerId,
  getManufacturerIdByUserId,
  getManufacturerId,
  getOrCreateManufacturerId,
  ensureManufacturer,
  upsert,
  upsertMany,
  deleteById,
  isUsernameTaken,
};
