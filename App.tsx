import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { EntryList } from './components/EntryList';
import { EntryForm } from './components/EntryForm';
import { AccountManage } from './components/AccountManage';
import { MasterManage } from './components/MasterManage';
import { storage } from './services/storage';
import { User, Page, EntrySheet, MasterData, UserRole } from './types';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>(Page.LOGIN);
  const [sheets, setSheets] = useState<EntrySheet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [masterData, setMasterData] = useState<MasterData>(storage.getMasterData());
  const [editingSheet, setEditingSheet] = useState<EntrySheet | null>(null);
  const [initialProductIndex, setInitialProductIndex] = useState<number>(0);

  // Initialize
  useEffect(() => {
    const savedUser = storage.getCurrentUser();
    if (savedUser) {
      setCurrentUser(savedUser);
      setCurrentPage(Page.LIST);
    }
    setSheets(storage.getSheets());
    setUsers(storage.getUsers());
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    storage.setCurrentUser(user);
    setCurrentPage(Page.LIST);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    storage.setCurrentUser(null);
    setCurrentPage(Page.LOGIN);
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

  const handleDuplicateSheet = (sheet: EntrySheet) => {
    const duplicated: EntrySheet = {
        ...sheet,
        id: uuidv4(),
        title: `${sheet.title} (コピー)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'draft', // Reset status on copy
    };
    storage.saveSheet(duplicated);
    setSheets(storage.getSheets());
  };

  const handleSaveSheet = (sheet: EntrySheet) => {
    storage.saveSheet(sheet);
    setSheets(storage.getSheets());
    setEditingSheet(null);
    setCurrentPage(Page.LIST);
  };

  const handleDeleteSheet = (id: string) => {
    storage.deleteSheet(id);
    setSheets(storage.getSheets());
  };

  // User Management
  const handleSaveUser = (user: User) => {
    const newUsers = [...users.filter(u => u.id !== user.id), user];
    storage.saveUsers(newUsers);
    setUsers(newUsers);
  };

  const handleDeleteUser = (id: string) => {
    const newUsers = users.filter(u => u.id !== id);
    storage.saveUsers(newUsers);
    setUsers(newUsers);
  };

  // Master Management
  const handleSaveMaster = (data: MasterData) => {
    storage.saveMasterData(data);
    setMasterData(data);
  };

  // --- Render ---

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout 
        currentUser={currentUser} 
        currentPage={currentPage} 
        onNavigate={setCurrentPage} 
        onLogout={handleLogout}
    >
        {currentPage === Page.LIST && (
            <EntryList 
                sheets={sheets} 
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
                onSave={handleSaveSheet}
                onCancel={() => {
                    setEditingSheet(null);
                    setCurrentPage(Page.LIST);
                }}
            />
        )}

        {currentPage === Page.ACCOUNTS && (
            <AccountManage 
                users={users} 
                onSaveUser={handleSaveUser} 
                onDeleteUser={handleDeleteUser} 
            />
        )}

        {currentPage === Page.MASTERS && (
            <MasterManage 
                data={masterData}
                onSave={handleSaveMaster}
            />
        )}
    </Layout>
  );
};

export default App;