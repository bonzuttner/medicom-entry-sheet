import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EntryList } from './components/EntryList';
import { EntryForm } from './components/EntryForm';
import { AdminEntryList } from './components/AdminEntryList';
import { AccountManage } from './components/AccountManage';
import { MasterManage } from './components/MasterManage';
import { dataService } from './services/dataService';
import {
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
  riskClassifications: [],
  specificIngredients: [],
  manufacturerShelfNames: {},
  manufacturerDefaultStartMonths: {},
};

const SHEET_PAGE_SIZE = 30;

const normalizeProductName = (value: string): string => value.trim().toLowerCase();
const normalizeManufacturerKey = (value: string): string => value.trim();
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
  const [masterData, setMasterData] = useState<MasterData>(EMPTY_MASTER_DATA);
  const [editingSheet, setEditingSheet] = useState<EntrySheet | null>(null);
  const [initialProductIndex, setInitialProductIndex] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [hasMoreSheets, setHasMoreSheets] = useState<boolean>(false);
  const [sheetOffset, setSheetOffset] = useState<number>(0);
  const [isLoadingMoreSheets, setIsLoadingMoreSheets] = useState<boolean>(false);
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
    setSheetOffset(firstPage.items.length);
  };

  const refreshFirstSheetsPage = () => {
    void dataService
      .getSheetsPage(0, SHEET_PAGE_SIZE)
      .then((page) => {
        setSheets(page.items);
        setHasMoreSheets(page.hasMore);
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
    } catch (error) {
      console.error('Failed to load more sheets:', error);
    } finally {
      setIsLoadingMoreSheets(false);
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
    const newSheet: EntrySheet = {
      id: uuidv4(),
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      creatorId: currentUser.id,
      creatorName: currentUser.displayName,
      manufacturerName: currentUser.manufacturerName,
      email: currentUser.email,
      phoneNumber: currentUser.phoneNumber,
      title: '',
      notes: '',
      attachments: [],
      status: 'draft',
      products: [
        {
          id: uuidv4(),
          shelfName: shelfOptions[0] || '',
          manufacturerName: currentUser.manufacturerName,
          janCode: '',
          productName: '',
          riskClassification: masterData.riskClassifications[0] || '',
          specificIngredients: [],
          catchCopy: '',
          productMessage: '',
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

  const handleDuplicateSheet = async (sheet: EntrySheet) => {
    try {
      const duplicatedProducts = sheet.products.map((product) => ({
        ...product,
        id: uuidv4(),
      }));

      const duplicated: EntrySheet = {
        ...sheet,
        id: uuidv4(),
        version: 1,
        title: `${sheet.title} (コピー)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft',
        products: duplicatedProducts,
      };
      const saved = await dataService.saveSheet(duplicated);
      setSheets((prev) => upsertSheetInList(prev, saved));
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to duplicate sheet:', error);
      alert('複製の保存に失敗しました。時間をおいて再試行してください。');
    }
  };

  const handleSaveSheet = async (sheet: EntrySheet) => {
    try {
      const savedSheet = await dataService.saveSheet(sheet);
      setEditingSheet(null);
      setEditingSheetRevisions([]);
      setCurrentPage(Page.LIST);
      setSheets((prev) => upsertSheetInList(prev, savedSheet));
      refreshFirstSheetsPage();
    } catch (error) {
      if (isVersionConflictError(error)) {
        const confirmOverwrite = window.confirm(
          '他のユーザーが先にこのシートを更新しました。\n最新内容を上書きして保存しますか？'
        );
        if (confirmOverwrite) {
          try {
            const savedSheet = await dataService.saveSheet(sheet, { forceOverwrite: true });
            setEditingSheet(null);
            setEditingSheetRevisions([]);
            setCurrentPage(Page.LIST);
            setSheets((prev) => upsertSheetInList(prev, savedSheet));
            refreshFirstSheetsPage();
            return;
          } catch (retryError) {
            console.error('Failed to overwrite save sheet after conflict:', retryError);
            alert(`上書き保存に失敗しました。\n${getSheetSaveErrorMessage(retryError)}`);
            return;
          }
        }
      }
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

  const handleDeleteSheet = async (id: string) => {
    try {
      await dataService.deleteSheet(id);
      setSheets((prev) => removeSheetFromList(prev, id));
      refreshFirstSheetsPage();
    } catch (error) {
      console.error('Failed to delete sheet:', error);
    }
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
        />
      )}

      {currentPage === Page.ADMIN_LIST && currentUser.role === UserRole.ADMIN && (
        <AdminEntryList
          sheets={visibleSheets}
          hasMore={hasMoreSheets}
          onLoadMore={loadMoreSheets}
          isLoadingMore={isLoadingMoreSheets}
          onEdit={handleEditSheet}
          onSaveAdminMemo={handleSaveSheetAdminMemo}
        />
      )}

      {currentPage === Page.EDIT && editingSheet && (
        <EntryForm
          initialData={editingSheet}
          initialActiveTab={initialProductIndex}
          masterData={masterData}
          reusableProductTemplates={reusableProductTemplates}
          revisions={editingSheetRevisions}
          currentUser={currentUser}
          onSearchProducts={(query, manufacturerName) =>
            dataService.searchProducts({ query, manufacturerName, limit: 30 })
          }
          onSave={handleSaveSheet}
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
