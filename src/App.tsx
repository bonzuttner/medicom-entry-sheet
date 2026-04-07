import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EntryList } from './components/EntryList';
import { EntryForm } from './components/EntryForm';
import { AdminEntryList } from './components/AdminEntryList';
import { AccountManage } from './components/AccountManage';
import { CreativeManage } from './components/CreativeManage';
import { MasterManage } from './components/MasterManage';
import { dataService } from './services/dataService';
import {
  Creative,
  User,
  Page,
  EntrySheet,
  MasterData,
  ProductEntry,
  UserRole,
  EntrySheetRevision,
} from './types';
import { v4 as uuidv4 } from 'uuid';

const EMPTY_MASTER_DATA: MasterData = {
  manufacturerNames: [],
  shelfNames: [],
  caseNames: [],
  riskClassifications: [],
  specificIngredients: [],
  manufacturerShelfNames: {},
  manufacturerCaseNames: {},
  manufacturerDefaultStartMonths: {},
  manufacturerFaceOptions: {},
};

const SHEET_PAGE_SIZE = 30;

const normalizeProductName = (value: string): string => value.trim().toLowerCase();
const normalizeManufacturerKey = (value: string): string => value.trim();
const normalizeOptionalString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const normalizeOptionalNumber = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const toComparableAdminMemo = (memo: EntrySheet['adminMemo']) => ({
  promoCode: normalizeOptionalString(memo?.promoCode),
  boardPickingJan: normalizeOptionalString(memo?.boardPickingJan),
  deadlineTableUrl: normalizeOptionalString(memo?.deadlineTableUrl),
  bandPattern: normalizeOptionalString(memo?.bandPattern),
  targetStoreCount: normalizeOptionalNumber(memo?.targetStoreCount),
  printBoard1Count: normalizeOptionalNumber(memo?.printBoard1Count),
  printBoard2Count: normalizeOptionalNumber(memo?.printBoard2Count),
  printBand1Count: normalizeOptionalNumber(memo?.printBand1Count),
  printBand2Count: normalizeOptionalNumber(memo?.printBand2Count),
  printOther: normalizeOptionalString(memo?.printOther),
  equipmentNote: normalizeOptionalString(memo?.equipmentNote),
  adminNote: normalizeOptionalString(memo?.adminNote),
});
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
    width: normalizeOptionalNumber(product.width),
    height: normalizeOptionalNumber(product.height),
    depth: normalizeOptionalNumber(product.depth),
    facingCount: normalizeOptionalNumber(product.facingCount),
    arrivalDate: normalizeOptionalString(product.arrivalDate),
    hasPromoMaterial: product.hasPromoMaterial === 'yes' ? 'yes' : 'no',
    promoSample: normalizeOptionalString(product.promoSample),
    specialFixture: normalizeOptionalString(product.specialFixture),
    promoWidth: normalizeOptionalNumber(product.promoWidth),
    promoHeight: normalizeOptionalNumber(product.promoHeight),
    promoDepth: normalizeOptionalNumber(product.promoDepth),
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
  deploymentStartMonth: normalizeOptionalNumber(sheet.deploymentStartMonth),
  deploymentEndMonth: normalizeOptionalNumber(sheet.deploymentEndMonth),
  faceLabel: normalizeOptionalString(sheet.faceLabel),
  faceMaxWidth: normalizeOptionalNumber(sheet.faceMaxWidth),
  status: sheet.status,
  entryStatus: sheet.entryStatus || sheet.status,
  creativeStatus: sheet.creativeStatus || 'none',
  currentAssignee: sheet.currentAssignee || 'none',
  assigneeUserId: normalizeOptionalString(sheet.assigneeUserId),
  returnReason: normalizeOptionalString(sheet.returnReason),
  products: toComparableProducts(sheet.products),
  attachments: toComparableAttachments(sheet.attachments),
});
const upsertSheetInList = (source: EntrySheet[], saved: EntrySheet): EntrySheet[] => {
  const idx = source.findIndex((sheet) => sheet.id === saved.id);
  if (idx === -1) {
    return [saved, ...source];
  }
  const next = [...source];
  next[idx] = saved;
  return next;
};
const removeSheetFromList = (source: EntrySheet[], id: string): EntrySheet[] =>
  source.filter((sheet) => sheet.id !== id);
const appendUniqueSheets = (source: EntrySheet[], incoming: EntrySheet[]): EntrySheet[] => {
  const seen = new Set(source.map((sheet) => sheet.id));
  const addition = incoming.filter((sheet) => !seen.has(sheet.id));
  return source.concat(addition);
};
const upsertUserInList = (source: User[], saved: User): User[] => {
  const idx = source.findIndex((user) => user.id === saved.id);
  if (idx === -1) {
    return [saved, ...source];
  }
  const next = [...source];
  next[idx] = saved;
  return next;
};
const removeUserFromList = (source: User[], id: string): User[] =>
  source.filter((user) => user.id !== id);

const getSheetSaveErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : '';
  if (!raw) return '保存処理に失敗しました。時間をおいて再試行してください。';

  if (raw.includes('解像度不足')) {
    return '商品画像の解像度が不足しています。短辺1500px以上の画像に差し替えてください。';
  }
  if (raw.includes('画像の解像度を判定できない') || raw.includes('Unsupported file type')) {
    return '商品画像の形式が未対応です。JPEG/PNG/WebP/GIF/BMPのいずれかを使用してください。';
  }
  if (raw.includes('Blob storage is not configured')) {
    return '画像保存先の設定が未完了です。管理者に連絡してください。';
  }
  if (raw.includes('入力内容を確認してください')) {
    return '入力内容に誤りがあります。必須項目・桁数・形式を確認してください。';
  }
  return raw;
};

const isVersionConflictError = (error: unknown): boolean => {
  const raw = error instanceof Error ? error.message : '';
  return raw.includes('VERSION_CONFLICT') || raw.includes('他のユーザーが先に更新');
};

const isJanConflictError = (error: unknown): boolean => {
  const raw = error instanceof Error ? error.message : '';
  return raw.includes('JAN_CONFLICT');
};

const cloneProductTemplate = (product: ProductEntry): ProductEntry => ({
  ...product,
  specificIngredients: [...product.specificIngredients],
});

const buildReusableProductTemplates = (
  sourceSheets: EntrySheet[],
  manufacturerName: string
): Record<string, ProductEntry> => {
  const index: Record<string, ProductEntry> = {};
  const scopedSheets = sourceSheets.filter(
    (sheet) => sheet.manufacturerName === manufacturerName
  );
  const sortedSheets = [...scopedSheets].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  for (const sheet of sortedSheets) {
    for (const product of sheet.products) {
      const key = normalizeProductName(product.productName || '');
      if (!key) continue;
      if (!index[key]) {
        index[key] = cloneProductTemplate(product);
      }
    }
  }

  return index;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>(Page.LOGIN);
  const [sheets, setSheets] = useState<EntrySheet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativeSheets, setCreativeSheets] = useState<EntrySheet[]>([]);
  const [masterData, setMasterData] = useState<MasterData>(EMPTY_MASTER_DATA);
  const [editingSheet, setEditingSheet] = useState<EntrySheet | null>(null);
  const [initialProductIndex, setInitialProductIndex] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [hasMoreSheets, setHasMoreSheets] = useState<boolean>(false);
  const [totalSheetCount, setTotalSheetCount] = useState<number>(0);
  const [sheetOffset, setSheetOffset] = useState<number>(0);
  const [isLoadingMoreSheets, setIsLoadingMoreSheets] = useState<boolean>(false);
  const [isLoadingCreatives, setIsLoadingCreatives] = useState<boolean>(false);
  const [editingSheetRevisions, setEditingSheetRevisions] = useState<EntrySheetRevision[]>([]);
  const masterSaveSeqRef = useRef(0);

  const handleNavigate = (page: Page) => {
    if (!currentUser) return;
    if (page === Page.MASTERS && currentUser.role !== UserRole.ADMIN) {
      setCurrentPage(Page.LIST);
      return;
    }
    if (page === Page.ADMIN_LIST && currentUser.role !== UserRole.ADMIN) {
      setCurrentPage(Page.LIST);
      return;
    }
    if (page === Page.CREATIVES && currentUser.role !== UserRole.ADMIN) {
      setCurrentPage(Page.LIST);
      return;
    }
    setCurrentPage(page);
    if (page !== Page.EDIT) {
      setEditingSheetRevisions([]);
    }
  };

  const loadAuxiliaryData = async (): Promise<{ users: User[]; masterData: MasterData }> => {
    const [usersResult, masterResult] = await Promise.allSettled([
      dataService.getUsers(),
      dataService.getMasterData(),
    ]);

    if (usersResult.status === 'rejected') {
      console.error('Failed to load users:', usersResult.reason);
    }
    if (masterResult.status === 'rejected') {
      console.error('Failed to load master data:', masterResult.reason);
    }

    return {
      users: usersResult.status === 'fulfilled' ? usersResult.value : [],
      masterData: masterResult.status === 'fulfilled' ? masterResult.value : EMPTY_MASTER_DATA,
    };
  };

  const loadInitialSheets = async (): Promise<void> => {
    const firstPage = await dataService.getSheetsPage(0, SHEET_PAGE_SIZE);
    setSheets(firstPage.items);
    setHasMoreSheets(firstPage.hasMore);
    setTotalSheetCount(firstPage.totalCount || firstPage.items.length);
    setSheetOffset(firstPage.items.length);
  };

  const refreshFirstSheetsPage = () => {
    void dataService
      .getSheetsPage(0, SHEET_PAGE_SIZE)
      .then((page) => {
        setSheets(page.items);
        setHasMoreSheets(page.hasMore);
        setTotalSheetCount(page.totalCount || page.items.length);
        setSheetOffset(page.items.length);
      })
      .catch((error) => console.error('Failed to refresh sheets:', error));
  };

  const loadMoreSheets = async (): Promise<void> => {
    if (isLoadingMoreSheets || !hasMoreSheets) return;

    setIsLoadingMoreSheets(true);
    try {
      const nextPage = await dataService.getSheetsPage(sheetOffset, SHEET_PAGE_SIZE);
      setSheets((prev) => appendUniqueSheets(prev, nextPage.items));
      setSheetOffset((prev) => prev + nextPage.items.length);
      setHasMoreSheets(nextPage.hasMore);
      setTotalSheetCount(nextPage.totalCount || 0);
    } catch (error) {
      console.error('Failed to load more sheets:', error);
    } finally {
      setIsLoadingMoreSheets(false);
    }
  };

  const loadCreatives = async (): Promise<void> => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
    setIsLoadingCreatives(true);
    try {
      const [creativeRows, allSheets] = await Promise.all([
        dataService.getCreatives(),
        dataService.getSheets(),
      ]);
      setCreatives(creativeRows);
      setCreativeSheets(allSheets);
    } catch (error) {
      console.error('Failed to load creatives:', error);
    } finally {
      setIsLoadingCreatives(false);
    }
  };

  // Initialize
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const savedUser = await dataService.getCurrentUser();

        if (!mounted) return;

        if (savedUser) {
          setCurrentUser(savedUser);
          setCurrentPage(Page.LIST);
          try {
            await loadInitialSheets();
            if (!mounted) return;
            void loadAuxiliaryData()
              .then((loaded) => {
                if (!mounted) return;
                setUsers(loaded.users);
                setMasterData(loaded.masterData);
              })
              .catch((error) => console.error('Failed to load auxiliary data:', error));
          } catch (error) {
            console.error('Failed to load initial sheets:', error);
          }
        } else {
          const loadedMaster = await dataService.getMasterData();
          if (!mounted) return;
          setMasterData(loadedMaster);
          setSheets([]);
          setUsers([]);
          setHasMoreSheets(false);
          setSheetOffset(0);
        }
      } catch (error) {
        console.error('Failed to initialize app data:', error);
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) return;
    if (currentPage !== Page.CREATIVES) return;
    void loadCreatives();
  }, [currentPage, currentUser]);

  const handleLogin = async (user: User) => {
    try {
      setCurrentUser(user);
      setCurrentPage(Page.LIST);
      await dataService.setCurrentUser(user);
      await loadInitialSheets();
      void loadAuxiliaryData()
        .then((loaded) => {
          setUsers(loaded.users);
          setMasterData(loaded.masterData);
        })
        .catch((error) => console.error('Failed to load auxiliary data after login:', error));
    } catch (error) {
      console.error('Failed to persist login session:', error);
    }
  };

  const handleLogout = async () => {
    try {
      setCurrentUser(null);
      setSheets([]);
      setUsers([]);
      setCreatives([]);
      setCreativeSheets([]);
      setMasterData(EMPTY_MASTER_DATA);
      setHasMoreSheets(false);
      setSheetOffset(0);
      setIsLoadingMoreSheets(false);
      await dataService.setCurrentUser(null);
      setCurrentPage(Page.LOGIN);
    } catch (error) {
      console.error('Failed to clear login session:', error);
    }
  };

  const handleCreateSheet = () => {
    if (!currentUser) return;
    const shelfOptions =
      masterData.manufacturerShelfNames?.[currentUser.manufacturerName] || masterData.shelfNames;
    const caseOptions =
      masterData.manufacturerCaseNames?.[currentUser.manufacturerName] || masterData.caseNames;
    const newSheet: EntrySheet = {
      id: uuidv4(),
      sheetCode: undefined,
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      creatorId: currentUser.id,
      creatorName: currentUser.displayName,
      manufacturerName: currentUser.manufacturerName,
      shelfName: shelfOptions[0] || '',
      caseName: caseOptions[0] || '',
      email: currentUser.email,
      phoneNumber: currentUser.phoneNumber,
      title: '',
      notes: '',
      faceLabel: '',
      faceMaxWidth: undefined,
      attachments: [],
      status: 'draft',
      products: [
        {
          id: uuidv4(),
          manufacturerName: currentUser.manufacturerName,
          janCode: '',
          productName: '',
      riskClassification: masterData.riskClassifications[0] || '',
      specificIngredients: [],
      catchCopy: '',
      productNotes: '',
          productAttachments: [],
          width: 0,
          height: 0,
          depth: 0,
          facingCount: 1,
          hasPromoMaterial: 'no',
        },
      ],
    };
    handleEditSheet(newSheet);
  };

  const handleEditSheet = (sheet: EntrySheet, productIndex: number = 0) => {
    setEditingSheet(sheet);
    setInitialProductIndex(productIndex);
    setCurrentPage(Page.EDIT);
    const persisted = sheets.some((row) => row.id === sheet.id);
    if (!persisted) {
      setEditingSheetRevisions([]);
      return;
    }
    void dataService
      .getSheetRevisions(sheet.id)
      .then((rows) => setEditingSheetRevisions(rows))
      .catch((error) => {
        console.error('Failed to load sheet revisions:', error);
        setEditingSheetRevisions([]);
      });
  };

  const saveSheetWithConflictHandling = async (
    sheet: EntrySheet,
    options?: { adminMemoOnlyChanged?: boolean }
  ): Promise<EntrySheet | null> => {
    const adminMemoOnlyChanged = options?.adminMemoOnlyChanged === true;

    try {
      return adminMemoOnlyChanged
        ? await dataService.saveSheetAdminMemo(sheet.id, sheet.adminMemo)
        : await dataService.saveSheet(sheet);
    } catch (error) {
      if (isVersionConflictError(error)) {
        const confirmOverwrite = window.confirm(
          adminMemoOnlyChanged
            ? '他のユーザーが先にAdminメモを更新しました。\n上書き保存しますか？'
            : '他のユーザーが先にこのシートを更新しました。\n最新内容を上書きして保存しますか？'
        );
        if (!confirmOverwrite) {
          return null;
        }

        return adminMemoOnlyChanged
          ? await dataService.saveSheetAdminMemo(sheet.id, sheet.adminMemo, {
              forceOverwrite: true,
            })
          : await dataService.saveSheet(sheet, { forceOverwrite: true });
      }

      if (isJanConflictError(error) && !adminMemoOnlyChanged) {
        const confirmJanOverwrite = window.confirm(
          'このJANコードは既に存在しています。上書きしますか？\n既存の商品が不明の場合は担当者へご連絡ください'
        );
        if (!confirmJanOverwrite) {
          return null;
        }
        return await dataService.saveSheet(sheet, { forceJanOverwrite: true });
      }

      throw error;
    }
  };

  const handleDuplicateSheet = async (sheet: EntrySheet) => {
    try {
      const duplicatedProducts = sheet.products.map((product) => ({
        ...product,
        id: uuidv4(),
      }));

      const duplicated: EntrySheet = {
        ...sheet,
        id: uuidv4(),
        sheetCode: undefined,
        version: 1,
        title: `${sheet.title} (コピー)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft',
        entryStatus: 'draft',
        creativeStatus: 'none',
        currentAssignee: 'none',
        returnReason: undefined,
        creative: undefined,
        products: duplicatedProducts,
      };
      const saved = await saveSheetWithConflictHandling(duplicated);
      if (!saved) return;
      setSheets((prev) => upsertSheetInList(prev, saved));
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to duplicate sheet:', error);
      alert(`複製の保存に失敗しました。\n${getSheetSaveErrorMessage(error)}`);
    }
  };

  const handleSaveSheet = async (sheet: EntrySheet) => {
    const existingSheet = sheets.find((row) => row.id === sheet.id);
    const adminMemoOnlyChanged =
      currentUser?.role === UserRole.ADMIN &&
      existingSheet != null &&
      JSON.stringify(toComparableSheetCore(existingSheet)) ===
        JSON.stringify(toComparableSheetCore(sheet)) &&
      JSON.stringify(toComparableAdminMemo(existingSheet.adminMemo)) !==
        JSON.stringify(toComparableAdminMemo(sheet.adminMemo));

    try {
      const savedSheet = await saveSheetWithConflictHandling(sheet, { adminMemoOnlyChanged });
      if (!savedSheet) return;
      setEditingSheet(null);
      setEditingSheetRevisions([]);
      setCurrentPage(Page.LIST);
      setSheets((prev) => upsertSheetInList(prev, savedSheet));
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to save sheet:', error);
      alert(`保存に失敗しました。\n${getSheetSaveErrorMessage(error)}`);
    }
  };

  const handleSaveSheetAdminMemo = async (
    sheetId: string,
    adminMemo: EntrySheet['adminMemo']
  ): Promise<EntrySheet> => {
    const target = sheets.find((sheet) => sheet.id === sheetId);
    if (!target) {
      alert('対象シートが見つかりません。再読み込みして再試行してください。');
      throw new Error('Sheet not found');
    }

    try {
      const savedSheet = await dataService.saveSheetAdminMemo(sheetId, adminMemo);
      setSheets((prev) => upsertSheetInList(prev, savedSheet));
      refreshFirstSheetsPage();
      return savedSheet;
    } catch (error) {
      if (isVersionConflictError(error)) {
        const confirmOverwrite = window.confirm(
          '他のユーザーが先にAdminメモを更新しました。\n上書き保存しますか？'
        );
        if (confirmOverwrite) {
          const savedSheet = await dataService.saveSheetAdminMemo(sheetId, adminMemo, {
            forceOverwrite: true,
          });
          setSheets((prev) => upsertSheetInList(prev, savedSheet));
          refreshFirstSheetsPage();
          return savedSheet;
        }
      }
      console.error('Failed to save admin memo:', error);
      alert(`Adminメモの保存に失敗しました。\n${getSheetSaveErrorMessage(error)}`);
      throw error instanceof Error ? error : new Error('Failed to save admin memo');
    }
  };

  const handleSaveSheetWorkflow = async (
    sheet: EntrySheet
  ): Promise<EntrySheet> => {
    try {
      const savedSheet = await dataService.saveSheetWorkflow(
        sheet.id,
        {
          version: sheet.version,
          creativeStatus: sheet.creativeStatus,
          currentAssignee: sheet.currentAssignee,
          assigneeUserId: sheet.assigneeUserId,
          returnReason: sheet.returnReason,
        }
      );
      setSheets((prev) => upsertSheetInList(prev, savedSheet));
      setEditingSheet((prev) => (prev && prev.id === savedSheet.id ? savedSheet : prev));
      refreshFirstSheetsPage();
      return savedSheet;
    } catch (error) {
      if (isVersionConflictError(error)) {
        const confirmOverwrite = window.confirm(
          '他のユーザーが先に進行状況を更新しました。\n上書き保存しますか？'
        );
        if (confirmOverwrite) {
          const savedSheet = await dataService.saveSheetWorkflow(
            sheet.id,
            {
              version: sheet.version,
              creativeStatus: sheet.creativeStatus,
              currentAssignee: sheet.currentAssignee,
              assigneeUserId: sheet.assigneeUserId,
              returnReason: sheet.returnReason,
            },
            { forceOverwrite: true }
          );
          setSheets((prev) => upsertSheetInList(prev, savedSheet));
          setEditingSheet((prev) => (prev && prev.id === savedSheet.id ? savedSheet : prev));
          refreshFirstSheetsPage();
          return savedSheet;
        }
      }
      console.error('Failed to save workflow:', error);
      throw error instanceof Error ? error : new Error('Failed to save workflow');
    }
  };

  const handleDeleteSheet = async (id: string) => {
    try {
      await dataService.deleteSheet(id);
      setSheets((prev) => removeSheetFromList(prev, id));
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to delete sheet:', error);
      alert(error instanceof Error ? error.message : 'エントリーシートの削除に失敗しました。');
    }
  };

  const handleSaveCreative = async (creative: Creative) => {
    try {
      const saved = await dataService.saveCreative(creative);
      const affectedSheetIds = new Set([
        ...creative.linkedSheets.map((sheet) => sheet.id),
        ...saved.linkedSheets.map((sheet) => sheet.id),
      ]);
      setCreatives((prev) => {
        const idx = prev.findIndex((row) => row.id === saved.id);
        if (idx === -1) return [saved, ...prev];
        const next = [...prev];
        next[idx] = saved;
        return next;
      });
      const latestSheets = await dataService.getSheets();
      setCreativeSheets(latestSheets);
      setSheets((prev) =>
        prev.map((sheet) => {
          if (!affectedSheetIds.has(sheet.id)) return sheet;
          return latestSheets.find((row) => row.id === sheet.id) || sheet;
        })
      );
      setEditingSheet((prev) => {
        if (!prev || !affectedSheetIds.has(prev.id)) return prev;
        return latestSheets.find((row) => row.id === prev.id) || prev;
      });
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to save creative:', error);
      throw error;
    }
  };

  const handleDeleteCreative = async (id: string) => {
    try {
      await dataService.deleteCreative(id);
      setCreatives((prev) => prev.filter((creative) => creative.id !== id));
    } catch (error) {
      console.error('Failed to delete creative:', error);
      alert(error instanceof Error ? error.message : 'クリエイティブの削除に失敗しました。');
    }
  };

  const handleRelinkSheetCreative = async (
    sheetId: string,
    targetCreativeId: string
  ): Promise<{ sheet: EntrySheet; creative: Creative }> => {
    const result = await dataService.relinkSheetCreative(sheetId, targetCreativeId);
    setSheets((prev) => upsertSheetInList(prev, result.sheet));
    setEditingSheet((prev) => (prev && prev.id === result.sheet.id ? result.sheet : prev));
    refreshFirstSheetsPage();
    return result;
  };

  // User Management
  const handleSaveUser = async (user: User) => {
    try {
      const savedUser = await dataService.saveUser(user);
      // Use API response as authoritative saved state.
      setUsers((prev) => upsertUserInList(prev, savedUser));
    } catch (error) {
      console.error('Failed to save user:', error);
      throw error;
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await dataService.deleteUser(id);
      setUsers((prev) => removeUserFromList(prev, id));
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  // Master Management
  const handleSaveMaster = async (data: MasterData) => {
    const seq = ++masterSaveSeqRef.current;
    try {
      const saved = await dataService.saveMasterData(data);
      if (seq === masterSaveSeqRef.current) {
        setMasterData(saved);
      }
    } catch (error) {
      console.error('Failed to save master data:', error);
    }
  };

  // --- Render ---

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        データを読み込み中...
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // Filter sheets based on user role and manufacturer
  const visibleSheets = currentUser.role === UserRole.ADMIN
    ? sheets
    : sheets.filter(
      (sheet) =>
        normalizeManufacturerKey(sheet.manufacturerName) ===
        normalizeManufacturerKey(currentUser.manufacturerName)
    );

  // Filter users based on user role and manufacturer
  const visibleUsers = currentUser.role === UserRole.ADMIN
    ? users
    : users.filter(
      (user) =>
        normalizeManufacturerKey(user.manufacturerName) ===
        normalizeManufacturerKey(currentUser.manufacturerName)
    );
  const targetManufacturerName = editingSheet?.manufacturerName ?? currentUser.manufacturerName;
  const reusableProductTemplates = buildReusableProductTemplates(
    sheets,
    targetManufacturerName
  );

  return (
    <Layout
      currentUser={currentUser}
      currentPage={currentPage}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {currentPage === Page.LIST && (
        <EntryList
          sheets={visibleSheets}
          currentUser={currentUser}
          onCreate={handleCreateSheet}
          onEdit={handleEditSheet}
          onDuplicate={handleDuplicateSheet}
          onDelete={handleDeleteSheet}
          hasMore={hasMoreSheets}
          onLoadMore={loadMoreSheets}
          isLoadingMore={isLoadingMoreSheets}
          totalCount={totalSheetCount}
        />
      )}

      {currentPage === Page.ADMIN_LIST && currentUser.role === UserRole.ADMIN && (
        <AdminEntryList
          sheets={visibleSheets}
          hasMore={hasMoreSheets}
          onLoadMore={loadMoreSheets}
          isLoadingMore={isLoadingMoreSheets}
          totalCount={totalSheetCount}
          onEdit={handleEditSheet}
          onSaveAdminMemo={handleSaveSheetAdminMemo}
        />
      )}

      {currentPage === Page.EDIT && editingSheet && (
        <EntryForm
          initialData={editingSheet}
          initialActiveTab={initialProductIndex}
          masterData={masterData}
          users={visibleUsers}
          reusableProductTemplates={reusableProductTemplates}
          revisions={editingSheetRevisions}
          currentUser={currentUser}
          onSearchProducts={(query, manufacturerName) =>
            dataService.searchProducts({ query, manufacturerName, limit: 30 })
          }
          onSave={handleSaveSheet}
          onSaveWorkflow={handleSaveSheetWorkflow}
          onOpenCreatives={() => setCurrentPage(Page.CREATIVES)}
          onRelinkCreative={handleRelinkSheetCreative}
          onCancel={() => {
            setEditingSheet(null);
            setEditingSheetRevisions([]);
            setCurrentPage(Page.LIST);
          }}
        />
      )}

      {currentPage === Page.ACCOUNTS && (
        <AccountManage
          users={visibleUsers}
          masterData={masterData}
          currentUser={currentUser}
          onSaveUser={handleSaveUser}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {currentPage === Page.CREATIVES && currentUser.role === UserRole.ADMIN && (
        <CreativeManage
          creatives={creatives}
          sheets={creativeSheets}
          currentUser={currentUser}
          onSaveCreative={handleSaveCreative}
          onDeleteCreative={handleDeleteCreative}
          isLoading={isLoadingCreatives}
        />
      )}

      {currentPage === Page.MASTERS && currentUser.role === UserRole.ADMIN && (
        <MasterManage
          data={masterData}
          onSave={handleSaveMaster}
        />
      )}
    </Layout>
  );
};

export default App;
