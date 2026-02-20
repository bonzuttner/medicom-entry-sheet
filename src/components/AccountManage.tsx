import React, { useMemo, useState } from 'react';
import { MasterData, User, UserRole } from '../types';
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface AccountManageProps {
  users: User[];
  masterData: MasterData;
  currentUser: User;
  onSaveUser: (user: User) => Promise<void> | void;
  onDeleteUser: (id: string) => void;
}

export const AccountManage: React.FC<AccountManageProps> = ({
  users,
  masterData,
  currentUser,
  onSaveUser,
  onDeleteUser,
}) => {
  const normalizeManufacturerKey = (value: string): string => value.trim();
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [validationError, setValidationError] = useState<string>('');
  const passwordRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  const emailRule = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const phoneRule = /^[0-9]{10,11}$/;

  const normalizePhoneNumber = (value: string): string =>
    value
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '');
  const manufacturerOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...masterData.manufacturerNames,
          ...users.map((u) => u.manufacturerName),
          currentUser.manufacturerName,
          editingUser?.manufacturerName || '',
        ].filter(Boolean))
      ),
    [masterData.manufacturerNames, users, currentUser.manufacturerName, editingUser?.manufacturerName]
  );

  // Permission check: Can the current user edit/delete this user?
  const canModifyUser = (targetUser: User): boolean => {
    if (currentUser.role === UserRole.ADMIN) return true;
    return (
      normalizeManufacturerKey(targetUser.manufacturerName) ===
      normalizeManufacturerKey(currentUser.manufacturerName)
    );
  };

  const handleSave = async () => {
    if (!editingUser?.username || !editingUser?.displayName || !editingUser?.manufacturerName || !editingUser?.password) {
      setValidationError('ログインID、担当者名、メーカー名、パスワードは必須です');
      return;
    }

    if (!passwordRule.test(editingUser.password)) {
      setValidationError('パスワードは大文字英字・小文字英字・数字・記号を含む8文字以上で入力してください');
      return;
    }

    const hasDuplicateUsername = users.some(
      u => u.username === editingUser.username && u.id !== editingUser.id
    );
    if (hasDuplicateUsername) {
      setValidationError(`ログインID「${editingUser.username}」は既に使用されています`);
      return;
    }

    // Permission validation: STAFF can only create/edit users in their own manufacturer
    if (
      currentUser.role === UserRole.STAFF &&
      normalizeManufacturerKey(editingUser.manufacturerName) !==
        normalizeManufacturerKey(currentUser.manufacturerName)
    ) {
      setValidationError(`他社（${editingUser.manufacturerName}）のアカウントは作成・編集できません`);
      return;
    }

    const normalizedEmail = (editingUser.email || '').trim();
    const normalizedPhone = normalizePhoneNumber(editingUser.phoneNumber || '');

    if (normalizedEmail && !emailRule.test(normalizedEmail)) {
      setValidationError('メールアドレスの形式が正しくありません');
      return;
    }

    if (normalizedPhone && !phoneRule.test(normalizedPhone)) {
      setValidationError('電話番号はハイフンなしの10〜11桁の半角数字で入力してください');
      return;
    }

    const existingUser = users.find(u => u.id === editingUser.id);
    const isNewUser = !editingUser.id;

    const newUser: User = {
        id: editingUser.id || uuidv4(),
        username: editingUser.username.trim(),
        displayName: editingUser.displayName.trim(),
        manufacturerName: editingUser.manufacturerName.trim(),
        email: normalizedEmail,
        phoneNumber: normalizedPhone,
        role: editingUser.role || UserRole.STAFF,
        password: editingUser.password || (isNewUser ? '' : existingUser?.password),
    };
    try {
      await onSaveUser(newUser);
      setEditingUser(null);
      setValidationError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存に失敗しました';
      setValidationError(message);
    }
  };

  const handleAddNew = () => {
    // STAFF users: Default to their manufacturer name
    const defaultManufacturer = currentUser.role === UserRole.STAFF
      ? currentUser.manufacturerName
      : (masterData.manufacturerNames[0] || '');
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
                        <label className="block text-sm font-medium text-slate-700">担当者名 <span className="text-red-500">*</span></label>
                        <input className="w-full border p-2 rounded" value={editingUser.displayName || ''} onChange={e => setEditingUser({...editingUser, displayName: e.target.value})} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">メーカー名 <span className="text-red-500">*</span></label>
                        <select
                            className="w-full border p-2 rounded bg-white"
                            value={editingUser.manufacturerName || ''}
                            onChange={e => setEditingUser({...editingUser, manufacturerName: e.target.value})}
                            disabled={currentUser.role === UserRole.STAFF}
                            title={currentUser.role === UserRole.STAFF ? '自社メーカー名のみ設定可能です' : ''}
                        >
                            {manufacturerOptions.length === 0 ? (
                                <option value="">メーカー名をマスタ管理で登録してください</option>
                            ) : (
                                manufacturerOptions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))
                            )}
                        </select>
                        {currentUser.role === UserRole.STAFF && (
                            <p className="text-xs text-slate-500 mt-1">※ 自社アカウントのみ作成できます</p>
                        )}
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">メールアドレス</label>
                        <input
                            type="email"
                            className="w-full border p-2 rounded"
                            value={editingUser.email || ''}
                            onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                            placeholder="example@company.co.jp"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700">電話番号</label>
                        <input
                            inputMode="numeric"
                            className="w-full border p-2 rounded"
                            value={editingUser.phoneNumber || ''}
                            onChange={e => setEditingUser({...editingUser, phoneNumber: normalizePhoneNumber(e.target.value)})}
                            placeholder="09012345678"
                            maxLength={11}
                        />
                        <p className="text-xs text-slate-500 mt-1">※ ハイフンなしで入力（10〜11桁）</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">パスワード <span className="text-red-500">*</span></label>
                        <input
                            type="password"
                            className="w-full border p-2 rounded"
                            value={editingUser.password || ''}
                            onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                            placeholder="大文字・小文字・数字・記号を含む8文字以上"
                            autoComplete="new-password"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            ※ 大文字英字・小文字英字・数字・記号を含む8文字以上
                        </p>
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
                        <th className="p-4 text-left">担当者名</th>
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
                                        onClick={() => {
                                          if (!canEdit) return;
                                          const { password: _password, ...safeUser } = u;
                                          setEditingUser(safeUser);
                                        }}
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
