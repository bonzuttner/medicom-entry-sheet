import { sql, type VercelPoolClient } from '@vercel/postgres';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * PostgreSQL Database Connection Pool
 *
 * Uses @vercel/postgres which provides:
 * - Automatic connection pooling
 * - Environment variable integration (POSTGRES_URL)
 * - Type-safe query builder
 *
 * Note: @vercel/postgres is deprecated. Future versions should migrate to Neon SDK.
 * See: https://vercel.com/docs/storage/vercel-postgres/using-an-orm
 */

const transactionClientStorage = new AsyncLocalStorage<VercelPoolClient>();

const getActiveClient = (): VercelPoolClient | null => {
  return transactionClientStorage.getStore() || null;
};

/**
 * Execute a SQL query with parameters
 *
 * @param query - SQL query string with $1, $2, etc. placeholders
 * @param params - Query parameters
 * @returns Query result
 *
 * @example
 * const result = await db.query('SELECT * FROM users WHERE username = $1', ['admin']);
 * const users = result.rows;
 */
export const query = async <T = any>(
  queryString: string,
  params: any[] = []
): Promise<{ rows: T[]; rowCount: number }> => {
  try {
    const client = getActiveClient();
    const result = client
      ? await client.query(queryString, params)
      : await sql.query(queryString, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
    };
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', queryString);
    console.error('Params:', params);
    throw error;
  }
};

/**
 * Execute a SQL query and return a single row
 *
 * @param query - SQL query string
 * @param params - Query parameters
 * @returns Single row or null
 *
 * @example
 * const user = await db.queryOne('SELECT * FROM users WHERE id = $1', [userId]);
 */
export const queryOne = async <T = any>(
  queryString: string,
  params: any[] = []
): Promise<T | null> => {
  const result = await query<T>(queryString, params);
  return result.rows[0] || null;
};

/**
 * Execute a transaction with automatic rollback on error
 *
 * @param callback - Transaction callback function
 * @returns Transaction result
 *
 * @example
 * await db.transaction(async (client) => {
 *   await client.query('INSERT INTO users ...');
 *   await client.query('INSERT INTO entry_sheets ...');
 * });
 */
export const transaction = async <T>(
  callback: (client: VercelPoolClient) => Promise<T>
): Promise<T> => {
  const existingClient = getActiveClient();
  if (existingClient) {
    return callback(existingClient);
  }

  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    const result = await transactionClientStorage.run(client, async () => callback(client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Transaction rollback error:', rollbackError);
    }
    console.error('Transaction rolled back due to error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if PostgreSQL connection is available
 *
 * @returns true if connected, false otherwise
 */
export const isConnected = async (): Promise<boolean> => {
  try {
    await sql.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

/**
 * Get database connection info (for debugging)
 */
export const getConnectionInfo = (): { url: string | undefined } => {
  return {
    url: process.env.POSTGRES_URL ? '[REDACTED]' : undefined,
  };
};

export default {
  query,
  queryOne,
  transaction,
  isConnected,
  getConnectionInfo,
};
