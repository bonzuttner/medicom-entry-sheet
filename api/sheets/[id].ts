import { canAccessManufacturer, isAdmin, requireUser } from '../_lib/auth.js';
import { getMethod, methodNotAllowed, readJsonBody, sendError, sendJson } from '../_lib/http.js';
import { deleteUnusedManagedBlobUrls, normalizeSheetMedia } from '../_lib/media.js';
import { EntrySheet, EntrySheetAdminMemo } from '../_lib/types.js';
import * as SheetRepository from '../_lib/repositories/sheets.js';

interface PutSheetBody {
  sheet?: EntrySheet;
  mode?: 'admin_memo';
  adminMemo?: EntrySheetAdminMemo;
  forceOverwrite?: boolean;
  forceJanOverwrite?: boolean;
}

const MAX_GENERAL_TEXT_LENGTH = 4000;
const PROMO_CODE_PATTERN = /^X\d{6}$/;
const JAN_13_PATTERN = /^\d{13}$/;
const HTTP_URL_PATTERN = /^https?:\/\/.+/i;

const getSheetId = (req: any): string | null => {
  const raw = req.query?.id;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

const normalizeStatus = (
  value: string | undefined
): 'draft' | 'completed' | 'completed_no_image' => {
  if (value === 'completed') return 'completed';
  if (value === 'completed_no_image') return 'completed_no_image';
  return 'draft';
};

const normalizeProducts = (
  incoming: EntrySheet['products'] | undefined,
  fallbackManufacturerName: string
): EntrySheet['products'] => {
  if (!Array.isArray(incoming)) return [];
  return incoming.map((product) => ({
    ...product,
    // Product manufacturer must always match sheet owner manufacturer.
    manufacturerName: fallbackManufacturerName,
    janCode: String(product.janCode || '').trim(),
    productName: String(product.productName || '').trim(),
  }));
};

const isTooLong = (value: string | undefined): boolean =>
  typeof value === 'string' && value.length > MAX_GENERAL_TEXT_LENGTH;

const findTooLongField = (sheet: EntrySheet): string | null => {
  if (isTooLong(sheet.title)) return 'タイトル';
  if (isTooLong(sheet.caseName)) return '案件';
  if (isTooLong(sheet.notes)) return 'エントリシート補足情報';
  if (isTooLong(sheet.shelfName)) return '棚割名';
  if (isTooLong(sheet.email)) return '作成者メール';
  if (isTooLong(sheet.phoneNumber)) return '作成者電話番号';
  if (isTooLong(sheet.adminMemo?.bandPattern)) return '帯パターン';
  if (isTooLong(sheet.adminMemo?.deadlineTableUrl)) return '期限表URL';
  if (isTooLong(sheet.adminMemo?.printOther)) return '印刷依頼数量 その他';
  if (isTooLong(sheet.adminMemo?.equipmentNote)) return '備品';
  if (isTooLong(sheet.adminMemo?.adminNote)) return '備考';

  for (let i = 0; i < sheet.products.length; i += 1) {
    const product = sheet.products[i];
    const prefix = `商品${i + 1}`;
    if (isTooLong(product.productName)) return `${prefix} 商品名`;
    if (isTooLong(product.janCode)) return `${prefix} JANコード`;
    if (isTooLong(product.catchCopy)) return `${prefix} キャッチコピー`;
    if (isTooLong(product.productNotes)) return `${prefix} 補足事項`;
    if (isTooLong(product.promoSample)) return `${prefix} 香り・色見本`;
    if (isTooLong(product.specialFixture)) return `${prefix} 特殊な陳列什器`;
  }

  return null;
};

const normalizeToHalfWidth = (value: string): string => value.normalize('NFKC');
const normalizeDigitsInput = (value: string): string =>
  normalizeToHalfWidth(value).replace(/[^0-9]/g, '');

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(normalizeToHalfWidth(String(value)).trim());
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
};

const toOptionalMonthNumber = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) return undefined;
  return parsed;
};

const computeAutoDeploymentEndMonth = (startMonth: number | undefined): number | undefined => {
  if (!startMonth) return undefined;
  return ((startMonth + 1) % 12) + 1;
};

const normalizeAdminMemo = (
  incoming: EntrySheetAdminMemo | undefined,
  existing: EntrySheetAdminMemo | undefined,
  editable: boolean
): EntrySheetAdminMemo | undefined => {
  if (!editable) return existing;
  return {
    version:
      Number.isInteger(Number(incoming?.version)) && Number(incoming?.version) > 0
        ? Number(incoming?.version)
        : Number(existing?.version) > 0
          ? Number(existing?.version)
          : 1,
    promoCode: normalizeToHalfWidth(String(incoming?.promoCode || '')).trim().toUpperCase() || undefined,
    boardPickingJan: normalizeDigitsInput(String(incoming?.boardPickingJan || '')).trim() || undefined,
    deadlineTableUrl: String(incoming?.deadlineTableUrl || '').trim() || undefined,
    bandPattern: normalizeDigitsInput(String(incoming?.bandPattern || '')).trim() || undefined,
    targetStoreCount: toOptionalNumber(incoming?.targetStoreCount),
    printBoard1Count: toOptionalNumber(incoming?.printBoard1Count),
    printBoard2Count: toOptionalNumber(incoming?.printBoard2Count),
    printBand1Count: toOptionalNumber(incoming?.printBand1Count),
    printBand2Count: toOptionalNumber(incoming?.printBand2Count),
    printOther: String(incoming?.printOther || '').trim() || undefined,
    equipmentNote: String(incoming?.equipmentNote || '').trim() || undefined,
    adminNote: String(incoming?.adminNote || '').trim() || undefined,
  };
};

const normalizeOptionalString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeOptionalNumberForCompare = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toComparableAdminMemo = (memo: EntrySheetAdminMemo | undefined) => ({
  promoCode: normalizeOptionalString(memo?.promoCode),
  boardPickingJan: normalizeOptionalString(memo?.boardPickingJan),
  deadlineTableUrl: normalizeOptionalString(memo?.deadlineTableUrl),
  bandPattern: normalizeOptionalString(memo?.bandPattern),
  targetStoreCount: normalizeOptionalNumberForCompare(memo?.targetStoreCount),
  printBoard1Count: normalizeOptionalNumberForCompare(memo?.printBoard1Count),
  printBoard2Count: normalizeOptionalNumberForCompare(memo?.printBoard2Count),
  printBand1Count: normalizeOptionalNumberForCompare(memo?.printBand1Count),
  printBand2Count: normalizeOptionalNumberForCompare(memo?.printBand2Count),
  printOther: normalizeOptionalString(memo?.printOther),
  equipmentNote: normalizeOptionalString(memo?.equipmentNote),
  adminNote: normalizeOptionalString(memo?.adminNote),
});

const hasAdminMemoContent = (memo: EntrySheetAdminMemo | undefined): boolean => {
  const comparable = toComparableAdminMemo(memo);
  return Object.values(comparable).some((value) =>
    typeof value === 'number' ? value !== null : value !== ''
  );
};

const toComparableAttachments = (attachments: EntrySheet['attachments']) =>
  (attachments || []).map((attachment) => ({
    name: normalizeOptionalString(attachment.name),
    size: Number(attachment.size) || 0,
    type: normalizeOptionalString(attachment.type),
    url: normalizeOptionalString(attachment.url),
  }));

const toComparableProducts = (products: EntrySheet['products']) =>
  (products || []).map((product) => ({
    id: normalizeOptionalString(product.id),
    manufacturerName: normalizeOptionalString(product.manufacturerName),
    janCode: normalizeOptionalString(product.janCode),
    productName: normalizeOptionalString(product.productName),
    productImage: normalizeOptionalString(product.productImage),
    riskClassification: normalizeOptionalString(product.riskClassification),
    specificIngredients: [...(product.specificIngredients || [])]
      .map((value) => normalizeOptionalString(value))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ja')),
    catchCopy: normalizeOptionalString(product.catchCopy),
    productNotes: normalizeOptionalString(product.productNotes),
    width: normalizeOptionalNumberForCompare(product.width),
    height: normalizeOptionalNumberForCompare(product.height),
    depth: normalizeOptionalNumberForCompare(product.depth),
    facingCount: normalizeOptionalNumberForCompare(product.facingCount),
    arrivalDate: normalizeOptionalString(product.arrivalDate),
    hasPromoMaterial: product.hasPromoMaterial === 'yes' ? 'yes' : 'no',
    promoSample: normalizeOptionalString(product.promoSample),
    specialFixture: normalizeOptionalString(product.specialFixture),
    promoWidth: normalizeOptionalNumberForCompare(product.promoWidth),
    promoHeight: normalizeOptionalNumberForCompare(product.promoHeight),
    promoDepth: normalizeOptionalNumberForCompare(product.promoDepth),
    promoImage: normalizeOptionalString(product.promoImage),
    productAttachments: (product.productAttachments || []).map((attachment) => ({
      name: normalizeOptionalString(attachment.name),
      size: Number(attachment.size) || 0,
      type: normalizeOptionalString(attachment.type),
      url: normalizeOptionalString(attachment.url),
    })),
  }));

const toComparableSheetCore = (sheet: EntrySheet) => ({
  manufacturerName: normalizeOptionalString(sheet.manufacturerName),
  creatorId: normalizeOptionalString(sheet.creatorId),
  creatorName: normalizeOptionalString(sheet.creatorName),
  email: normalizeOptionalString(sheet.email),
  phoneNumber: normalizeOptionalString(sheet.phoneNumber),
  title: normalizeOptionalString(sheet.title),
  caseName: normalizeOptionalString(sheet.caseName),
  notes: normalizeOptionalString(sheet.notes),
  shelfName: normalizeOptionalString(sheet.shelfName),
  deploymentStartMonth: normalizeOptionalNumberForCompare(sheet.deploymentStartMonth),
  deploymentEndMonth: normalizeOptionalNumberForCompare(sheet.deploymentEndMonth),
  faceLabel: normalizeOptionalString(sheet.faceLabel),
  faceMaxWidth: normalizeOptionalNumberForCompare(sheet.faceMaxWidth),
  status: normalizeStatus(sheet.status),
  products: toComparableProducts(sheet.products),
  attachments: toComparableAttachments(sheet.attachments),
});

const validateAdminMemo = (memo: EntrySheetAdminMemo | undefined): string | null => {
  if (!memo) return null;
  if (memo.promoCode && !PROMO_CODE_PATTERN.test(memo.promoCode)) {
    return '販促CDは X000000 形式で入力してください';
  }
  if (memo.boardPickingJan && !JAN_13_PATTERN.test(memo.boardPickingJan)) {
    return 'ボードピッキングJANは13桁の数字で入力してください';
  }
  if (memo.deadlineTableUrl && !HTTP_URL_PATTERN.test(memo.deadlineTableUrl)) {
    return '期限表URLは http:// または https:// から始まる形式で入力してください';
  }
  return null;
};

const buildRevisionSummary = (before: EntrySheet | null, after: EntrySheet): string => {
  if (!before) {
    return `新規作成: タイトル="${after.title}" / 商品件数=${after.products.length}`;
  }

  const changes: string[] = [];
  const pushChange = (label: string, prev: unknown, next: unknown) => {
    const left = prev == null || prev === '' ? '(空)' : String(prev);
    const right = next == null || next === '' ? '(空)' : String(next);
    if (left !== right) {
      changes.push(`${label}: ${left} -> ${right}`);
    }
  };

  pushChange('タイトル', before.title, after.title);
  pushChange('案件', before.caseName || '', after.caseName || '');
  pushChange('補足', before.notes || '', after.notes || '');
  pushChange('棚割名', before.shelfName || '', after.shelfName || '');
  pushChange('作成者名', before.creatorName, after.creatorName);
  pushChange('作成者メール', before.email, after.email);
  pushChange('作成者電話', before.phoneNumber, after.phoneNumber);
  pushChange('状態', before.status, after.status);
  pushChange('展開スタート月', before.deploymentStartMonth, after.deploymentStartMonth);
  pushChange('展開終了月', before.deploymentEndMonth, after.deploymentEndMonth);
  pushChange('フェイス数', before.faceLabel || '', after.faceLabel || '');
  pushChange('フェイスMAX値', before.faceMaxWidth, after.faceMaxWidth);

  if (before.products.length !== after.products.length) {
    changes.push(`商品件数: ${before.products.length} -> ${after.products.length}`);
  }

  const minLen = Math.min(before.products.length, after.products.length);
  for (let i = 0; i < minLen; i += 1) {
    const prev = before.products[i];
    const next = after.products[i];
    const prefix = `商品${i + 1}`;
    pushChange(`${prefix}.商品名`, prev.productName, next.productName);
    pushChange(`${prefix}.JAN`, prev.janCode, next.janCode);
    pushChange(`${prefix}.リスク分類`, prev.riskClassification, next.riskClassification);
  }

  if (changes.length === 0) return '変更なしで保存';
  return changes.slice(0, 80).join('\n');
};

const stripAdminMemo = (sheet: EntrySheet): EntrySheet => ({
  ...sheet,
  adminMemo: undefined,
});

export default async function handler(req: any, res: any) {
  const method = getMethod(req);
  if (method !== 'PUT' && method !== 'DELETE') {
    methodNotAllowed(res);
    return;
  }

  const sheetId = getSheetId(req);
  if (!sheetId) {
    sendError(res, 400, 'Sheet id is required');
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  await SheetRepository.pruneRetentionIfDue();

  if (method === 'PUT') {
    const body = await readJsonBody<PutSheetBody>(req);
    if (body.mode === 'admin_memo') {
      if (!isAdmin(currentUser)) {
        sendError(res, 403, 'Only admin can update admin memo');
        return;
      }

      const existingSheet = await SheetRepository.findById(sheetId);
      if (!existingSheet) {
        sendError(res, 404, 'Sheet not found');
        return;
      }
      if (!canAccessManufacturer(currentUser, existingSheet.manufacturerName)) {
        sendError(res, 403, 'You cannot modify this sheet');
        return;
      }

      const normalizedMemo = normalizeAdminMemo(body.adminMemo, existingSheet.adminMemo, true);
      const adminMemoValidationError = validateAdminMemo(normalizedMemo);
      if (adminMemoValidationError) {
        sendError(res, 400, adminMemoValidationError);
        return;
      }
      if (isTooLong(normalizedMemo?.deadlineTableUrl)) {
        sendError(res, 400, `期限表URLは${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
        return;
      }
      if (isTooLong(normalizedMemo?.bandPattern)) {
        sendError(res, 400, `帯パターンは${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
        return;
      }
      if (isTooLong(normalizedMemo?.printOther)) {
        sendError(res, 400, `印刷依頼数量 その他は${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
        return;
      }
      if (isTooLong(normalizedMemo?.equipmentNote)) {
        sendError(res, 400, `備品は${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
        return;
      }
      if (isTooLong(normalizedMemo?.adminNote)) {
        sendError(res, 400, `備考は${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
        return;
      }

      let updated: boolean;
      try {
        updated = await SheetRepository.updateAdminMemoOnly(
          sheetId,
          normalizedMemo,
          {
            expectedVersion: normalizedMemo?.version,
            forceOverwrite: body.forceOverwrite === true,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === 'VERSION_CONFLICT' || error.message === 'ADMIN_MEMO_VERSION_CONFLICT')
        ) {
          sendError(res, 409, 'VERSION_CONFLICT');
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to save admin memo';
        sendError(res, 500, message);
        return;
      }
      if (!updated) {
        sendError(res, 404, 'Sheet not found');
        return;
      }
      const updatedSheet = await SheetRepository.findById(sheetId);
      if (!updatedSheet) {
        sendError(res, 500, 'Failed to reload saved sheet');
        return;
      }
      sendJson(res, 200, { ok: true, sheet: stripAdminMemo(updatedSheet) });
      return;
    }

    const sheet = body.sheet;
    if (!sheet) {
      sendError(res, 400, 'sheet is required');
      return;
    }

    const existingSheet = await SheetRepository.findById(sheetId);

    // Server-authoritative save DTO:
    // - New sheet: always owned by current session user
    // - Existing sheet: preserve immutable owner id/manufacturer from existing record
    // - Header fields (creatorName/email/phoneNumber) are editable and stored as snapshots
    const ownerManufacturer = existingSheet?.manufacturerName || currentUser.manufacturerName;
    const ownerCreatorId = existingSheet?.creatorId || currentUser.id;
    const canEditAdminMemo = isAdmin(currentUser);
    const incomingStartMonth = toOptionalMonthNumber(sheet.deploymentStartMonth);
    const resolvedStartMonth = incomingStartMonth ?? existingSheet?.deploymentStartMonth;
    const autoEndMonth = computeAutoDeploymentEndMonth(resolvedStartMonth);
    const incomingEndMonth = toOptionalMonthNumber(sheet.deploymentEndMonth);
    const resolvedEndMonth = isAdmin(currentUser)
      ? incomingEndMonth ?? existingSheet?.deploymentEndMonth ?? autoEndMonth
      : existingSheet?.deploymentEndMonth ?? autoEndMonth;

    const safeSheet: EntrySheet = {
      ...sheet,
      id: sheetId,
      version:
        Number.isInteger(Number(sheet.version)) && Number(sheet.version) > 0
          ? Number(sheet.version)
          : Number(existingSheet?.version) > 0
            ? Number(existingSheet?.version)
            : 1,
      manufacturerName: ownerManufacturer,
      creatorId: ownerCreatorId,
      creatorName: String(sheet.creatorName || existingSheet?.creatorName || currentUser.displayName || '').trim(),
      email: String(sheet.email || existingSheet?.email || currentUser.email || '').trim(),
      phoneNumber: String(sheet.phoneNumber || existingSheet?.phoneNumber || currentUser.phoneNumber || '').trim(),
      title: String(sheet.title || '').trim(),
      caseName: String(sheet.caseName || existingSheet?.caseName || '').trim(),
      notes: sheet.notes ? String(sheet.notes).trim() : '',
      shelfName: String(sheet.shelfName || existingSheet?.shelfName || '').trim(),
      deploymentStartMonth: resolvedStartMonth,
      deploymentEndMonth: resolvedEndMonth,
      adminMemo: normalizeAdminMemo(sheet.adminMemo, existingSheet?.adminMemo, canEditAdminMemo),
      status: normalizeStatus(sheet.status),
      createdAt: existingSheet?.createdAt || sheet.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: normalizeProducts(sheet.products, ownerManufacturer),
      attachments: Array.isArray(sheet.attachments) ? sheet.attachments : [],
    };

    const adminMemoChanged = existingSheet
      ? JSON.stringify(toComparableAdminMemo(existingSheet.adminMemo)) !==
        JSON.stringify(toComparableAdminMemo(safeSheet.adminMemo))
      : hasAdminMemoContent(safeSheet.adminMemo);
    const nonAdminSheetChanged = existingSheet
      ? JSON.stringify(toComparableSheetCore(existingSheet)) !==
        JSON.stringify(toComparableSheetCore(safeSheet))
      : true;

    if (safeSheet.products.length === 0) {
      sendError(res, 400, 'At least one product is required');
      return;
    }
    const tooLongField = findTooLongField(safeSheet);
    if (tooLongField) {
      sendError(res, 400, `${tooLongField}は${MAX_GENERAL_TEXT_LENGTH}文字以内で入力してください`);
      return;
    }
    const adminMemoValidationError = validateAdminMemo(safeSheet.adminMemo);
    if (adminMemoValidationError) {
      sendError(res, 400, adminMemoValidationError);
      return;
    }

    if (!canAccessManufacturer(currentUser, safeSheet.manufacturerName)) {
      sendError(res, 403, 'You can only save sheets in your manufacturer');
      return;
    }

    // Get existing sheet for blob cleanup
    const beforeSheets = existingSheet ? [existingSheet] : [];

    // Normalize media URLs (convert data URLs to Vercel Blob)
    let normalizedSheet: EntrySheet;
    try {
      normalizedSheet = await normalizeSheetMedia(
        safeSheet,
        `pharmapop/sheets/${safeSheet.id}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid media payload';
      sendError(res, 400, message);
      return;
    }

    // Permission check for existing sheet
    if (existingSheet && !canAccessManufacturer(currentUser, existingSheet.manufacturerName)) {
      sendError(res, 403, 'You cannot modify this sheet');
      return;
    }

    // STAFF cannot mark completed for other manufacturers (defense-in-depth).
    if (!isAdmin(currentUser) && safeSheet.manufacturerName !== currentUser.manufacturerName) {
      sendError(res, 403, 'You can only save sheets in your manufacturer');
      return;
    }

    // Save to database
    if (existingSheet && isAdmin(currentUser) && !nonAdminSheetChanged && adminMemoChanged) {
      try {
        const updated = await SheetRepository.updateAdminMemoOnly(
          sheetId,
          safeSheet.adminMemo,
          {
            expectedVersion: safeSheet.adminMemo?.version,
            forceOverwrite: body.forceOverwrite === true,
          }
        );
        if (!updated) {
          sendError(res, 404, 'Sheet not found');
          return;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message === 'VERSION_CONFLICT' || error.message === 'ADMIN_MEMO_VERSION_CONFLICT')
        ) {
          sendError(res, 409, 'VERSION_CONFLICT');
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to save admin memo';
        sendError(res, 500, message);
        return;
      }
      const updatedSheet = await SheetRepository.findById(sheetId);
      if (!updatedSheet) {
        sendError(res, 500, 'Failed to reload saved sheet');
        return;
      }
      sendJson(res, 200, { ok: true, sheet: stripAdminMemo(updatedSheet) });
      return;
    }

    try {
      await SheetRepository.upsert(
        { ...normalizedSheet, id: sheetId },
        {
          changedByUserId: currentUser.id,
          changedByName: currentUser.displayName || currentUser.username,
          summary: buildRevisionSummary(existingSheet, safeSheet),
          keepLatestCount: 30,
          updateAdminMemo: canEditAdminMemo && adminMemoChanged,
          expectedVersion: safeSheet.version,
          forceOverwrite: body.forceOverwrite === true,
          forceJanOverwrite: body.forceJanOverwrite === true,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'VERSION_CONFLICT' || error.message === 'ADMIN_MEMO_VERSION_CONFLICT')
      ) {
        await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
        sendError(res, 409, 'VERSION_CONFLICT');
        return;
      }
      if (error instanceof Error && error.message === 'JAN_CONFLICT') {
        await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
        sendError(res, 409, 'JAN_CONFLICT');
        return;
      }
      if (error instanceof Error && error.message === 'DUPLICATE_JAN_WITHIN_SHEET') {
        await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
        sendError(res, 400, '同じシート内で同一JANコードは登録できません。JANコードを確認してください。');
        return;
      }
      // DB save failed after media normalization/upload.
      // Delete newly uploaded blobs that are not part of the previous persisted sheet.
      await deleteUnusedManagedBlobUrls([normalizedSheet], beforeSheets);
      const message = error instanceof Error ? error.message : 'Failed to save sheet';
      sendError(res, 500, message);
      return;
    }

    const updatedSheet = await SheetRepository.findById(sheetId);
    if (!updatedSheet) {
      sendError(res, 500, 'Failed to reload saved sheet');
      return;
    }
    sendJson(res, 200, { ok: true, sheet: isAdmin(currentUser) ? updatedSheet : stripAdminMemo(updatedSheet) });
    // Clean up unused blob URLs in background to reduce response latency.
    void deleteUnusedManagedBlobUrls(beforeSheets, [normalizedSheet]).catch((error) => {
      console.warn('Deferred blob cleanup failed after save:', error);
    });
    return;
  }

  // DELETE
  const target = await SheetRepository.findById(sheetId);
  if (!target) {
    sendError(res, 404, 'Sheet not found');
    return;
  }

  if (!canAccessManufacturer(currentUser, target.manufacturerName)) {
    sendError(res, 403, 'You cannot delete this sheet');
    return;
  }

  // Delete from database
  await SheetRepository.deleteById(sheetId);

  sendJson(res, 200, { ok: true });
  // Clean up blob URLs in background to reduce response latency.
  void deleteUnusedManagedBlobUrls([target], []).catch((error) => {
    console.warn('Deferred blob cleanup failed after delete:', error);
  });
}
