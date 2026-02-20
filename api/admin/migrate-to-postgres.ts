/**
 * データ移行エンドポイント: JSON StoreData → PostgreSQL
 *
 * 使用方法:
 * 1. 既存データを /api/admin/migrate からGETでエクスポート
 * 2. このエンドポイントにPOSTでインポート
 *
 * POST /api/admin/migrate-to-postgres
 * Body: { data: StoreData }
 */

import { sql } from '@vercel/postgres';
import { createHash } from 'crypto';
import { isAdmin, requireUser } from '../_lib/auth.js';
import {
  getMethod,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
} from '../_lib/http.js';
import { readStore } from '../_lib/store.js';
import { StoreData, EntrySheet, ProductEntry, Attachment } from '../_lib/types.js';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidStoreData = (data: unknown): data is StoreData => {
  if (!isObject(data)) return false;
  return Array.isArray(data.users) && Array.isArray(data.sheets) && isObject(data.master);
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const deterministicUuid = (value: string): string => {
  const hex = createHash('md5').update(value).digest('hex').split('');
  hex[12] = '4';
  const variant = (parseInt(hex[16], 16) & 0x3) | 0x8;
  hex[16] = variant.toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
};

const ensureUuid = (value: string, scope: string): string =>
  isUuid(value) ? value : deterministicUuid(`${scope}:${value}`);

const normalizeStoreDataForPostgres = (data: StoreData): StoreData => {
  const userIdMap = new Map<string, string>();
  const users = data.users.map((user) => {
    const nextId = ensureUuid(user.id, 'user');
    userIdMap.set(user.id, nextId);
    return { ...user, id: nextId };
  });

  const sheetIdMap = new Map<string, string>();
  const productIdMap = new Map<string, string>();

  const sheets = data.sheets.map((sheet) => {
    const nextSheetId = ensureUuid(sheet.id, 'sheet');
    sheetIdMap.set(sheet.id, nextSheetId);

    const nextCreatorId = userIdMap.get(sheet.creatorId) || ensureUuid(sheet.creatorId, 'user');

    const products = sheet.products.map((product) => {
      const nextProductId = ensureUuid(product.id, 'product');
      productIdMap.set(product.id, nextProductId);
      return { ...product, id: nextProductId };
    });

    return {
      ...sheet,
      id: nextSheetId,
      creatorId: nextCreatorId,
      products,
    };
  });

  return {
    ...data,
    users,
    sheets,
  };
};

/**
 * メーカーマスターをPostgreSQLに投入
 * @returns メーカー名 → UUID のマッピング
 */
const migrateManufacturers = async (
  manufacturerNames: string[]
): Promise<Map<string, string>> => {
  const mapping = new Map<string, string>();

  for (const name of manufacturerNames) {
    const result = await sql`
      INSERT INTO manufacturers (name)
      VALUES (${name})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    mapping.set(name, result.rows[0].id);
  }

  return mapping;
};

/**
 * ユーザーをPostgreSQLに投入
 * @returns ユーザーID（UUID文字列） → PostgreSQL UUID のマッピング
 */
const migrateUsers = async (
  users: StoreData['users'],
  manufacturerMapping: Map<string, string>
): Promise<Map<string, string>> => {
  const mapping = new Map<string, string>();

  for (const user of users) {
    const manufacturerId = manufacturerMapping.get(user.manufacturerName);
    if (!manufacturerId) {
      throw new Error(`Manufacturer not found: ${user.manufacturerName}`);
    }

    // 既存ユーザーがあれば削除（旧ID形式からの移行を考慮してusername基準）
    await sql`DELETE FROM users WHERE username = ${user.username}`;

    const result = await sql`
      INSERT INTO users (
        id, username, password_hash, display_name, manufacturer_id,
        email, phone_number, role, created_at, updated_at
      ) VALUES (
        ${user.id},
        ${user.username},
        ${user.password || ''},
        ${user.displayName},
        ${manufacturerId},
        ${user.email},
        ${user.phoneNumber || ''},
        ${user.role},
        NOW(),
        NOW()
      )
      ON CONFLICT (username) DO UPDATE SET
        id = EXCLUDED.id,
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        display_name = EXCLUDED.display_name,
        manufacturer_id = EXCLUDED.manufacturer_id,
        email = EXCLUDED.email,
        phone_number = EXCLUDED.phone_number,
        role = EXCLUDED.role,
        updated_at = NOW()
      RETURNING id
    `;
    mapping.set(user.id, result.rows[0].id);
  }

  return mapping;
};

/**
 * エントリーシートをPostgreSQLに投入
 */
const migrateSheets = async (
  sheets: EntrySheet[],
  manufacturerMapping: Map<string, string>
): Promise<void> => {
  for (const sheet of sheets) {
    const manufacturerId = manufacturerMapping.get(sheet.manufacturerName);
    if (!manufacturerId) {
      throw new Error(`Manufacturer not found for sheet: ${sheet.manufacturerName}`);
    }

    // 既存シートがあれば削除（CASCADE で商品・添付ファイルも削除）
    await sql`DELETE FROM entry_sheets WHERE id = ${sheet.id}`;

    // シート本体を投入
    await sql`
      INSERT INTO entry_sheets (
        id, creator_id, manufacturer_id, title, notes, status,
        created_at, updated_at
      ) VALUES (
        ${sheet.id},
        ${sheet.creatorId},
        ${manufacturerId},
        ${sheet.title},
        ${sheet.notes || null},
        ${sheet.status},
        ${sheet.createdAt || new Date().toISOString()},
        ${sheet.updatedAt || new Date().toISOString()}
      )
    `;

    // シートの添付ファイルを投入
    if (sheet.attachments && sheet.attachments.length > 0) {
      await migrateAttachments(sheet.attachments, sheet.id, null);
    }

    // 商品エントリーを投入
    await migrateProducts(sheet.products, sheet.id, manufacturerMapping);
  }
};

/**
 * 商品エントリーをPostgreSQLに投入
 */
const migrateProducts = async (
  products: ProductEntry[],
  sheetId: string,
  manufacturerMapping: Map<string, string>
): Promise<void> => {
  for (const product of products) {
    const manufacturerId = manufacturerMapping.get(product.manufacturerName);
    if (!manufacturerId) {
      throw new Error(`Manufacturer not found for product: ${product.manufacturerName}`);
    }

    await sql`
      INSERT INTO product_entries (
        id, sheet_id, shelf_name, manufacturer_id, jan_code, product_name,
        product_image_url, risk_classification, catch_copy, product_message,
        product_notes, width, height, depth, facing_count, arrival_date,
        has_promo_material, promo_sample, special_fixture,
        promo_width, promo_height, promo_depth, promo_image_url,
        created_at, updated_at
      ) VALUES (
        ${product.id},
        ${sheetId},
        ${product.shelfName},
        ${manufacturerId},
        ${product.janCode},
        ${product.productName},
        ${product.productImage || null},
        ${product.riskClassification || null},
        ${product.catchCopy || null},
        ${product.productMessage || null},
        ${product.productNotes || null},
        ${product.width || null},
        ${product.height || null},
        ${product.depth || null},
        ${product.facingCount || null},
        ${product.arrivalDate || null},
        ${product.hasPromoMaterial === 'yes'},
        ${product.promoSample || null},
        ${product.specialFixture || null},
        ${product.promoWidth || null},
        ${product.promoHeight || null},
        ${product.promoDepth || null},
        ${product.promoImage || null},
        NOW(),
        NOW()
      )
    `;

    // 特定成分を投入
    if (product.specificIngredients && product.specificIngredients.length > 0) {
      for (const ingredient of product.specificIngredients) {
        await sql`
          INSERT INTO product_ingredients (product_id, ingredient_name)
          VALUES (${product.id}, ${ingredient})
          ON CONFLICT (product_id, ingredient_name) DO NOTHING
        `;
      }
    }

    // 商品の添付ファイルを投入
    if (product.productAttachments && product.productAttachments.length > 0) {
      await migrateAttachments(product.productAttachments, null, product.id);
    }
  }
};

/**
 * 添付ファイルをPostgreSQLに投入
 */
const migrateAttachments = async (
  attachments: Attachment[],
  sheetId: string | null,
  productId: string | null
): Promise<void> => {
  for (const attachment of attachments) {
    await sql`
      INSERT INTO attachments (
        sheet_id, product_id, name, size, type, url, created_at
      ) VALUES (
        ${sheetId},
        ${productId},
        ${attachment.name},
        ${attachment.size},
        ${attachment.type},
        ${attachment.url},
        NOW()
      )
    `;
  }
};

/**
 * マスターデータをPostgreSQLに投入
 */
const migrateMasterData = async (master: StoreData['master']): Promise<void> => {
  const categories = [
    { key: 'shelf_name', values: master.shelfNames },
    { key: 'risk_classification', values: master.riskClassifications },
    { key: 'specific_ingredient', values: master.specificIngredients },
  ];

  for (const category of categories) {
    for (let i = 0; i < category.values.length; i++) {
      await sql`
        INSERT INTO master_data (category, value, display_order)
        VALUES (${category.key}, ${category.values[i]}, ${i})
        ON CONFLICT (category, value) DO UPDATE SET display_order = EXCLUDED.display_order
      `;
    }
  }
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  if (method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  // 認証・認可チェック
  await readStore();
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;
  if (!isAdmin(currentUser)) {
    sendError(res, 403, 'Only admin can migrate data to PostgreSQL');
    return;
  }

  const body = await readJsonBody<{ data?: StoreData }>(req);
  if (!isValidStoreData(body.data)) {
    sendError(res, 400, 'data with users/sheets/master is required');
    return;
  }

  const normalizedData = normalizeStoreDataForPostgres(body.data);

  try {
    // トランザクション開始
    await sql`BEGIN`;

    // 1. メーカーマスターを投入
    const manufacturerMapping = await migrateManufacturers(
      normalizedData.master.manufacturerNames
    );

    // 2. ユーザーを投入
    await migrateUsers(normalizedData.users, manufacturerMapping);

    // 3. エントリーシートを投入（商品・添付ファイルも含む）
    await migrateSheets(normalizedData.sheets, manufacturerMapping);

    // 4. マスターデータを投入
    await migrateMasterData(normalizedData.master);

    // トランザクションコミット
    await sql`COMMIT`;

    sendJson(res, 200, {
      ok: true,
      migrated: {
        manufacturers: manufacturerMapping.size,
        users: normalizedData.users.length,
        sheets: normalizedData.sheets.length,
        products: normalizedData.sheets.reduce((sum, s) => sum + s.products.length, 0),
      },
    });
  } catch (error) {
    // エラー発生時はロールバック
    try {
      await sql`ROLLBACK`;
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }

    const message = error instanceof Error ? error.message : 'Migration failed';
    console.error('Migration error:', error);
    sendError(res, 500, `Migration failed: ${message}`);
  }
}
