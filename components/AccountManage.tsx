import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react';

interface AccountManageProps {
  users: User[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
}

export const AccountManage: React.FC<AccountManageProps> = ({ users, currentUser, onSaveUser, onDeleteUser }) => {
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [validationError, setValidationError] = useState<string>('');

  // Permission check: Can the current user edit/delete this user?
  const canModifyUser = (targetUser: User): boolean => {
    if (currentUser.role === UserRole.ADMIN) return true;
    return targetUser.manufacturerName === currentUser.manufacturerName;
  };

  const handleSave = () => {
    if (!editingUser?.username || !editingUser?.displayName || !editingUser?.manufacturerName) {
      setValidationError('ログインID、表示名、メーカー名は必須です');
      return;
    }

    // Permission validation: STAFF can only create/edit users in their own manufacturer
    if (currentUser.role === UserRole.STAFF && editingUser.manufacturerName !== currentUser.manufacturerName) {
      setValidationError(`他社（${editingUser.manufacturerName}）のアカウントは作成・編集できません`);
      return;
    }

    const newUser: User = {
        id: editingUser.id || Date.now().toString(),
        username: editingUser.username,
        displayName: editingUser.displayName,
        manufacturerName: editingUser.manufacturerName,
        email: editingUser.email || '',
        phoneNumber: editingUser.phoneNumber || '',
        role: editingUser.role || UserRole.STAFF,
        password: 'password', // Default
    };
    onSaveUser(newUser);
    setEditingUser(null);
    setValidationError('');
  };

  const handleAddNew = () => {
    // STAFF users: Default to their manufacturer name
    const defaultManufacturer = currentUser.role === UserRole.STAFF ? currentUser.manufacturerName : '';
    setEditingUser({
      role: UserRole.STAFF,
      manufacturerName: defaultManufacturer
    });
    setValidationError('');
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800">アカウント管理</h2>
            <button
                onClick={handleAddNew}
                className="bg-primary hover:bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
                <Plus size={18} /> 追加
            </button>
        </div>

        {editingUser && (
            <div className="bg-white p-6 rounded-lg shadow-lg border border-primary mb-6 animate-in fade-in zoom-in-95">
                <h3 className="font-bold mb-4">{editingUser.id ? 'アカウント編集' : '新規アカウント'}</h3>

                {validationError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-800">
                        <AlertCircle size={18} />
                        <span className="text-sm">{validationError}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">ログインID <span className="text-red-500">*</span></label>
                        <input className="w-full border p-2 rounded" value={editingUser.username || ''} onChange={e => setEditingUser({...editingUser, username: e.target.value})} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">表示名 <span className="text-red-500">*</span></label>
                        <input className="w-full border p-2 rounded" value={editingUser.displayName || ''} onChange={e => setEditingUser({...editingUser, displayName: e.target.value})} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">メーカー名 <span className="text-red-500">*</span></label>
                        <input
                            className="w-full border p-2 rounded"
                            value={editingUser.manufacturerName || ''}
                            onChange={e => setEditingUser({...editingUser, manufacturerName: e.target.value})}
                            disabled={currentUser.role === UserRole.STAFF}
                            title={currentUser.role === UserRole.STAFF ? '自社メーカー名のみ設定可能です' : ''}
                        />
                        {currentUser.role === UserRole.STAFF && (
                            <p className="text-xs text-slate-500 mt-1">※ 自社アカウントのみ作成できます</p>
                        )}
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">メールアドレス</label>
                        <input className="w-full border p-2 rounded" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">電話番号</label>
                        <input className="w-full border p-2 rounded" value={editingUser.phoneNumber || ''} onChange={e => setEditingUser({...editingUser, phoneNumber: e.target.value})} />
                    </div>
                </div>
                <div className="mt-4 flex gap-2 justify-end">
                    <button onClick={() => { setEditingUser(null); setValidationError(''); }} className="px-4 py-2 text-slate-600">キャンセル</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded">保存</button>
                </div>
            </div>
        )}

        <div className="bg-white rounded-lg shadow border overflow-hidden">
            <table className="w-full">
                <thead className="bg-slate-50 border-b">
                    <tr>
                        <th className="p-4 text-left">表示名</th>
                        <th className="p-4 text-left">ID</th>
                        <th className="p-4 text-left">メーカー名</th>
                        <th className="p-4 text-left">権限</th>
                        <th className="p-4 text-right">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(u => {
                        const canEdit = canModifyUser(u);
                        return (
                            <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="p-4 font-bold">{u.displayName}</td>
                                <td className="p-4 text-slate-500">{u.username}</td>
                                <td className="p-4">{u.manufacturerName}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}`}>
                                        {u.role === UserRole.ADMIN ? '管理者' : '一般'}
                                    </span>
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button
                                        onClick={() => canEdit && setEditingUser(u)}
                                        disabled={!canEdit}
                                        className={`p-2 rounded ${canEdit ? 'text-primary hover:bg-blue-50' : 'text-slate-300 cursor-not-allowed'}`}
                                        title={canEdit ? '編集' : '編集権限がありません'}
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        onClick={() => canEdit && window.confirm('本当に削除しますか？') && onDeleteUser(u.id)}
                                        disabled={!canEdit}
                                        className={`p-2 rounded ${canEdit ? 'text-danger hover:bg-red-50' : 'text-slate-300 cursor-not-allowed'}`}
                                        title={canEdit ? '削除' : '削除権限がありません'}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
  );
};
