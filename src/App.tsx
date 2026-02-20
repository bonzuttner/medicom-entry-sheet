import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EntryList } from './components/EntryList';
import { EntryForm } from './components/EntryForm';
import { AccountManage } from './components/AccountManage';
import { MasterManage } from './components/MasterManage';
import { dataService } from './services/dataService';
import { User, Page, EntrySheet, MasterData, ProductEntry, UserRole } from './types';
import { v4 as uuidv4 } from 'uuid';


const EMPTY_MASTER_DATA: MasterData = {
  manufacturerNames: [],
  shelfNames: [],
  riskClassifications: [],
  specificIngredients: [],
};

const normalizeProductName = (value: string): string => value.trim().toLowerCase();

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
  const masterSaveSeqRef = useRef(0);

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
            const [loadedSheets, loadedUsers, loadedMaster] = await Promise.all([
              dataService.getSheets(),
              dataService.getUsers(),
              dataService.getMasterData(),
            ]);
            if (!mounted) return;
            setSheets(loadedSheets);
            setUsers(loadedUsers);
            setMasterData(loadedMaster);
          } catch (error) {
            console.error('Failed to load authenticated data:', error);
          }
        } else {
          const loadedMaster = await dataService.getMasterData();
          if (!mounted) return;
          setMasterData(loadedMaster);
          setSheets([]);
          setUsers([]);
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
      const [loadedSheets, loadedUsers, loadedMaster] = await Promise.all([
        dataService.getSheets(),
        dataService.getUsers(),
        dataService.getMasterData(),
      ]);
      setSheets(loadedSheets);
      setUsers(loadedUsers);
      setMasterData(loadedMaster);
    } catch (error) {
      console.error('Failed to persist login session:', error);
    }
  };

  const handleLogout = async () => {
    try {
      setCurrentUser(null);
      setSheets([]);
      setUsers([]);
      await dataService.setCurrentUser(null);
      setCurrentPage(Page.LOGIN);
    } catch (error) {
      console.error('Failed to clear login session:', error);
    }
  };

  const handleCreateSheet = () => {
    if (!currentUser) return;
    const newSheet: EntrySheet = {
        id: uuidv4(),
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
                shelfName: masterData.shelfNames[0] || '',
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
            }
        ]
    };
    handleEditSheet(newSheet);
  };

  const handleEditSheet = (sheet: EntrySheet, productIndex: number = 0) => {
    setEditingSheet(sheet);
    setInitialProductIndex(productIndex);
    setCurrentPage(Page.EDIT);
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
          title: `${sheet.title} (コピー)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'draft', // Reset status on copy
          products: duplicatedProducts,
      };
      await dataService.saveSheet(duplicated);
      setSheets(await dataService.getSheets());
    } catch (error) {
      console.error('Failed to duplicate sheet:', error);
      alert('複製の保存に失敗しました。時間をおいて再試行してください。');
    }
  };

  const handleSaveSheet = async (sheet: EntrySheet) => {
    try {
      await dataService.saveSheet(sheet);
      setSheets(await dataService.getSheets());
      setEditingSheet(null);
      setCurrentPage(Page.LIST);
    } catch (error) {
      console.error('Failed to save sheet:', error);
      const message = error instanceof Error ? error.message : '保存に失敗しました';
      alert(`保存に失敗しました: ${message}`);
    }
  };

  const handleDeleteSheet = async (id: string) => {
    try {
      await dataService.deleteSheet(id);
      setSheets(await dataService.getSheets());
    } catch (error) {
      console.error('Failed to delete sheet:', error);
    }
  };

  // User Management
  const handleSaveUser = async (user: User) => {
    try {
      await dataService.saveUser(user);
      const refreshedUsers = await dataService.getUsers();
      setUsers(refreshedUsers);
    } catch (error) {
      console.error('Failed to save user:', error);
      throw error;
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await dataService.deleteUser(id);
      const refreshedUsers = await dataService.getUsers();
      setUsers(refreshedUsers);
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  // Master Management
  const handleSaveMaster = async (data: MasterData) => {
    const seq = ++masterSaveSeqRef.current;
    try {
      await dataService.saveMasterData(data);
      if (seq === masterSaveSeqRef.current) {
        setMasterData(data);
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
    : sheets.filter(sheet => sheet.manufacturerName === currentUser.manufacturerName);

  // Filter users based on user role and manufacturer
  const visibleUsers = currentUser.role === UserRole.ADMIN
    ? users
    : users.filter(user => user.manufacturerName === currentUser.manufacturerName);
  const targetManufacturerName = editingSheet?.manufacturerName ?? currentUser.manufacturerName;
  const reusableProductTemplates = buildReusableProductTemplates(
    sheets,
    targetManufacturerName
  );

  return (
    <Layout
        currentUser={currentUser}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
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
            />
        )}

        {currentPage === Page.EDIT && editingSheet && (
            <EntryForm
                initialData={editingSheet}
                initialActiveTab={initialProductIndex}
                masterData={masterData}
                reusableProductTemplates={reusableProductTemplates}
                onSave={handleSaveSheet}
                onCancel={() => {
                    setEditingSheet(null);
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
