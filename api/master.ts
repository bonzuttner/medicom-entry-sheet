import { isAdmin, requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { MasterData } from './_lib/types.js';
import * as MasterRepository from './_lib/repositories/masters.js';

interface PutMasterBody {
  data?: MasterData;
}

const MAX_MASTER_VALUE_LENGTH = 20;

const findTooLongMasterValue = (data: MasterData): string | null => {
  const categories: Array<{ label: string; values: string[] }> = [
    { label: 'メーカー名', values: data.manufacturerNames || [] },
    { label: '棚割名', values: data.shelfNames || [] },
    { label: 'リスク分類', values: data.riskClassifications || [] },
    { label: '特定成分', values: data.specificIngredients || [] },
  ];

  for (const category of categories) {
    for (const value of category.values) {
      if (typeof value === 'string' && value.length > MAX_MASTER_VALUE_LENGTH) {
        return category.label;
      }
    }
  }

  const shelfMap = data.manufacturerShelfNames || {};
  for (const [manufacturerName, shelfNames] of Object.entries(shelfMap)) {
    if (manufacturerName.length > MAX_MASTER_VALUE_LENGTH) {
      return 'メーカー名';
    }
    for (const value of shelfNames) {
      if (typeof value === 'string' && value.length > MAX_MASTER_VALUE_LENGTH) {
        return '棚割名';
      }
    }
  }

  const defaultStartMonthsMap = data.manufacturerDefaultStartMonths || {};
  for (const [manufacturerName, months] of Object.entries(defaultStartMonthsMap)) {
    if (manufacturerName.length > MAX_MASTER_VALUE_LENGTH) {
      return 'メーカー名';
    }
    for (const month of months) {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return 'デフォルト展開スタート月';
      }
    }
  }

  return null;
};

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  if (method === 'GET') {
    // Read-only master values are required for entry form dropdowns for all authenticated users.
    const masterData = await MasterRepository.getAll();
    const shelfNamesForCurrentUser = await MasterRepository.getShelfNamesByManufacturerName(
      currentUser.manufacturerName
    );
    if (!isAdmin(currentUser)) {
      sendJson(res, 200, {
        manufacturerNames: [],
        shelfNames: shelfNamesForCurrentUser,
        riskClassifications: masterData.riskClassifications,
        specificIngredients: masterData.specificIngredients,
      });
      return;
    }
    const manufacturerShelfNames = await MasterRepository.getManufacturerShelfNamesMap();
    const manufacturerDefaultStartMonths =
      await MasterRepository.getManufacturerDefaultStartMonthsMap();
    sendJson(res, 200, {
      ...masterData,
      shelfNames: shelfNamesForCurrentUser,
      manufacturerShelfNames,
      manufacturerDefaultStartMonths,
    });
    return;
  }

  if (method === 'PUT') {
    if (!isAdmin(currentUser)) {
      sendError(res, 403, 'Only admin can update master data');
      return;
    }

    const body = await readJsonBody<PutMasterBody>(req);
    if (!body.data) {
      sendError(res, 400, 'data is required');
      return;
    }
    const tooLongCategory = findTooLongMasterValue(body.data);
    if (tooLongCategory) {
      sendError(res, 400, `${tooLongCategory}は${MAX_MASTER_VALUE_LENGTH}文字以内で入力してください`);
      return;
    }

    const updated = await MasterRepository.updateAll(body.data);
    if (Object.prototype.hasOwnProperty.call(body.data, 'manufacturerShelfNames')) {
      const shelfMap = body.data.manufacturerShelfNames || {};
      const normalizedShelfMap = Object.fromEntries(
        (body.data.manufacturerNames || []).map((name) => [
          name,
          shelfMap[name] || [],
        ])
      );
      await MasterRepository.updateManufacturerShelfNamesMap(normalizedShelfMap);
    }
    if (Object.prototype.hasOwnProperty.call(body.data, 'manufacturerDefaultStartMonths')) {
      const monthMap = body.data.manufacturerDefaultStartMonths || {};
      const normalizedMonthMap = Object.fromEntries(
        (body.data.manufacturerNames || []).map((name) => [
          name,
          monthMap[name] || [],
        ])
      );
      await MasterRepository.updateManufacturerDefaultStartMonthsMap(normalizedMonthMap);
    }
    const shelfNamesForCurrentUser = await MasterRepository.getShelfNamesByManufacturerName(
      currentUser.manufacturerName
    );
    const manufacturerShelfNames = await MasterRepository.getManufacturerShelfNamesMap();
    const manufacturerDefaultStartMonths =
      await MasterRepository.getManufacturerDefaultStartMonthsMap();
    sendJson(res, 200, {
      ...updated,
      shelfNames: shelfNamesForCurrentUser,
      manufacturerShelfNames,
      manufacturerDefaultStartMonths,
    });
    return;
  }

  methodNotAllowed(res);
}
