import React, { useState, useEffect } from 'react';
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
      const duplicated: EntrySheet = {
          ...sheet,
          id: uuidv4(),
          title: `${sheet.title} (コピー)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'draft', // Reset status on copy
      };
      await dataService.saveSheet(duplicated);
      setSheets(await dataService.getSheets());
    } catch (error) {
      console.error('Failed to duplicate sheet:', error);
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
      const newUsers = [...users.filter(u => u.id !== user.id), user];
      await dataService.saveUsers(newUsers);
      setUsers(newUsers);
    } catch (error) {
      console.error('Failed to save user:', error);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const newUsers = users.filter(u => u.id !== id);
      await dataService.saveUsers(newUsers);
      setUsers(newUsers);
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  // Master Management
  const handleSaveMaster = async (data: MasterData) => {
    try {
      await dataService.saveMasterData(data);
      setMasterData(data);
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
