import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Edit, Image as ImageIcon, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../services/apiClient';
import { Creative, CreativeLinkedSheet, EntrySheet, User } from '../types';

interface CreativeManageProps {
  creatives: Creative[];
  sheets: EntrySheet[];
  currentUser: User;
  onSaveCreative: (creative: Creative) => Promise<void> | void;
  onDeleteCreative: (id: string) => Promise<void> | void;
  isLoading?: boolean;
}

type SortKey =
  | 'name'
  | 'updatedAt'
  | 'sheetCode'
  | 'manufacturerName'
  | 'shelfName'
  | 'caseName';

type CreativeDraft = Creative & {
  selectedSheetIds: string[];
};

const getFirstLinkedSheet = (creative: Creative): CreativeLinkedSheet | undefined => creative.linkedSheets[0];

const getSummaryText = (values: string[]): string => {
  const filtered = [...new Set(values.filter(Boolean))];
  if (filtered.length === 0) return '未設定';
  if (filtered.length === 1) return filtered[0];
  return `${filtered[0]} ほか${filtered.length - 1}件`;
};

const normalizeSearchText = (value: string): string => value.normalize('NFKC').trim().toLowerCase();
const canModifyCreativeLinkage = (sheet: EntrySheet): boolean =>
  (sheet.entryStatus || sheet.status) !== 'draft' &&
  ((sheet.creativeStatus || 'none') === 'none' || (sheet.creativeStatus || 'none') === 'in_progress');

const buildDuplicateCreativeDraft = (creative: Creative | CreativeDraft, currentUser: User): CreativeDraft => ({
  ...creative,
  id: uuidv4(),
  version: 1,
  creatorId: currentUser.id,
  creatorName: currentUser.displayName,
  name: `${creative.name} (コピー)`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  linkedSheets: [],
  selectedSheetIds: [],
});

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const CreativeManage: React.FC<CreativeManageProps> = ({
  creatives,
  sheets,
  currentUser,
  onSaveCreative,
  onDeleteCreative,
  isLoading = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sheetSearchTerm, setSheetSearchTerm] = useState('');
  const [editingCreative, setEditingCreative] = useState<CreativeDraft | null>(null);
  const [originalCreative, setOriginalCreative] = useState<CreativeDraft | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Creative | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Check if form has unsaved changes
  const isDirty = useMemo(() => {
    if (!editingCreative || !originalCreative) return false;
    return (
      editingCreative.name !== originalCreative.name ||
      editingCreative.imageUrl !== originalCreative.imageUrl ||
      editingCreative.memo !== originalCreative.memo ||
      JSON.stringify(editingCreative.selectedSheetIds.sort()) !== JSON.stringify(originalCreative.selectedSheetIds.sort())
    );
  }, [editingCreative, originalCreative]);

  // Browser back/reload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('編集内容が保存されていません。破棄してよろしいですか？');
  }, [isDirty]);

  const sheetById = useMemo(
    () => new Map(sheets.map((sheet) => [sheet.id, sheet])),
    [sheets]
  );
  const linkedCreativeIdBySheetId = useMemo(() => {
    const map = new Map<string, string>();
    creatives.forEach((creative) => {
      creative.linkedSheets.forEach((sheet) => {
        map.set(sheet.id, creative.id);
      });
    });
    return map;
  }, [creatives]);
  const filteredCreatives = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchTerm);
    const filtered = creatives.filter((creative) => {
      if (!normalizedQuery) return true;
      const haystacks = [
        creative.name,
        creative.manufacturerName,
        creative.memo || '',
        ...creative.linkedSheets.flatMap((sheet) => [
          sheet.sheetCode || '',
          sheet.title,
          sheet.manufacturerName,
          sheet.shelfName,
          sheet.caseName,
        ]),
      ];
      return haystacks.some((value) => normalizeSearchText(value).includes(normalizedQuery));
    });

    const getSortValue = (creative: Creative): string | number => {
      const firstLinkedSheet = getFirstLinkedSheet(creative);
      switch (sortKey) {
        case 'name':
          return creative.name;
        case 'sheetCode':
          return firstLinkedSheet?.sheetCode || '';
        case 'manufacturerName':
          return getSummaryText(
            creative.linkedSheets.length > 0
              ? creative.linkedSheets.map((sheet) => sheet.manufacturerName)
              : [creative.manufacturerName]
          );
        case 'shelfName':
          return getSummaryText(creative.linkedSheets.map((sheet) => sheet.shelfName));
        case 'caseName':
          return getSummaryText(creative.linkedSheets.map((sheet) => sheet.caseName));
        case 'updatedAt':
        default:
          return new Date(creative.updatedAt).getTime();
      }
    };

    return [...filtered].sort((left, right) => {
      const a = getSortValue(left);
      const b = getSortValue(right);
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (typeof a === 'number' && typeof b === 'number') {
        return (a - b) * multiplier;
      }
      return String(a).localeCompare(String(b), 'ja') * multiplier;
    });
  }, [creatives, searchTerm, sortKey, sortOrder]);

  const candidateSheets = useMemo(() => {
    const normalizedQuery = normalizeSearchText(sheetSearchTerm);
    return [...sheets]
      .filter((sheet) => canModifyCreativeLinkage(sheet))
      .filter((sheet) => {
        if (!normalizedQuery) return true;
        const fields = [
          sheet.sheetCode || '',
          sheet.title,
          sheet.manufacturerName,
          sheet.shelfName,
          sheet.caseName,
        ];
        return fields.some((value) => normalizeSearchText(value).includes(normalizedQuery));
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sheetSearchTerm, sheets]);

  const startNewCreative = () => {
    const newDraft: CreativeDraft = {
      id: uuidv4(),
      version: 1,
      manufacturerName: currentUser.manufacturerName || '',
      creatorId: currentUser.id,
      creatorName: currentUser.displayName,
      name: '',
      imageUrl: '',
      memo: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedSheets: [],
      selectedSheetIds: [],
    };
    setEditingCreative(newDraft);
    setOriginalCreative(newDraft);
    setSheetSearchTerm('');
    setValidationError('');
  };

  const editCreative = (creative: Creative) => {
    const draft: CreativeDraft = {
      ...creative,
      selectedSheetIds: creative.linkedSheets.map((sheet) => sheet.id),
    };
    setEditingCreative(draft);
    setOriginalCreative(draft);
    setSheetSearchTerm('');
    setValidationError('');
  };

  const duplicateCreative = (creative: Creative) => {
    const draft = buildDuplicateCreativeDraft(creative, currentUser);
    setEditingCreative(draft);
    setOriginalCreative(draft);
    setSheetSearchTerm('');
    setValidationError('');
  };

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortOrder(nextKey === 'updatedAt' ? 'desc' : 'asc');
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={14} className="text-primary" />
    ) : (
      <ArrowDown size={14} className="text-primary" />
    );
  };

  const setSelectedSheetIds = (sheetIds: string[]) => {
    if (!editingCreative) return;
    const linkedSheets = sheetIds
      .map((id) => sheetById.get(id))
      .filter((sheet): sheet is EntrySheet => Boolean(sheet))
      .map(
        (sheet): CreativeLinkedSheet => ({
          id: sheet.id,
          sheetCode: sheet.sheetCode,
          title: sheet.title,
          manufacturerName: sheet.manufacturerName,
          shelfName: sheet.shelfName,
          caseName: sheet.caseName,
        })
      );
    const linkedManufacturers = [...new Set(linkedSheets.map((sheet) => sheet.manufacturerName).filter(Boolean))];
    setEditingCreative({
      ...editingCreative,
      manufacturerName:
        linkedManufacturers.length === 1 ? linkedManufacturers[0] : editingCreative.manufacturerName,
      linkedSheets,
      selectedSheetIds: sheetIds,
    });
  };

  const toggleSheetSelection = (sheetId: string) => {
    if (!editingCreative) return;
    const currentLinkedCreativeId = linkedCreativeIdBySheetId.get(sheetId);
    if (currentLinkedCreativeId && currentLinkedCreativeId !== editingCreative.id) {
      return;
    }
    const current = new Set<string>(editingCreative.selectedSheetIds);
    if (current.has(sheetId)) {
      current.delete(sheetId);
    } else {
      current.add(sheetId);
    }
    setSelectedSheetIds(Array.from(current));
  };

  const handleImageSelect = async (file: File) => {
    if (!editingCreative) return;
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setValidationError('対応していない画像形式です。PNG, JPEG, WebP, GIF, BMP形式の画像を選択してください。');
      return;
    }
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setValidationError('画像サイズが大きすぎます。10MB以下の画像を選択してください。');
      return;
    }
    try {
      setIsUploadingImage(true);
      const dataUrl = await toDataUrl(file);
      const result = await apiClient.post<{ url: string }>('/api/upload', {
        dataUrl,
        fileName: file.name,
        kind: 'creative',
      });
      setEditingCreative({
        ...editingCreative,
        imageUrl: result.url,
      });
      setValidationError('');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : '画像のアップロードに失敗しました。');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      void handleImageSelect(file);
    }
  };

  const handleSave = async () => {
    if (!editingCreative || isSaving) return;
    if (!editingCreative.name.trim()) {
      setValidationError('クリエイティブ名は必須です');
      return;
    }
    if (!editingCreative.imageUrl.trim()) {
      setValidationError('画像は必須です');
      return;
    }
    if (!editingCreative.manufacturerName.trim()) {
      setValidationError('メーカーは必須です');
      return;
    }
    const selectedManufacturers = [...new Set(editingCreative.linkedSheets.map((sheet) => sheet.manufacturerName).filter(Boolean))];
    if (selectedManufacturers.length > 1) {
      setValidationError('紐づけるエントリーシートのメーカーは1つに揃えてください');
      return;
    }

    try {
      setIsSaving(true);
      await onSaveCreative({
        ...editingCreative,
        manufacturerName: editingCreative.linkedSheets[0]?.manufacturerName || editingCreative.manufacturerName,
        linkedSheets: editingCreative.linkedSheets,
      });
      closeEditor(true); // Skip confirmation since we just saved
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Provide user-friendly error messages
      if (message === 'VERSION_CONFLICT') {
        setValidationError('他のユーザーが更新しました。画面を再読み込みして最新データを取得してください。');
      } else if (message === 'CREATIVE_REQUIRED_FIELDS') {
        setValidationError('必須項目を入力してください。');
      } else if (message === 'MANUFACTURER_NOT_FOUND') {
        setValidationError('指定されたメーカーが見つかりません。');
      } else if (message === 'SHEET_NOT_FOUND') {
        setValidationError('紐づけ先のエントリーシートが見つかりません。');
      } else if (message === 'SHEET_ALREADY_LINKED') {
        setValidationError('選択したシートは既に他のクリエイティブに紐づいています。');
      } else if (message === 'SHEET_MANUFACTURER_MISMATCH') {
        setValidationError('シートのメーカーとクリエイティブのメーカーが一致しません。');
      } else if (message === 'SHEET_WORKFLOW_LOCKED') {
        setValidationError('確認待ち・差し戻し・承認済みのシートに紐づくクリエイティブは、シート詳細で制作に戻してから変更してください。');
      } else {
        setValidationError(message || '保存に失敗しました。');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const closeEditor = (skipConfirm = false) => {
    if (!skipConfirm && !confirmDiscardChanges()) return;
    setEditingCreative(null);
    setOriginalCreative(null);
    setValidationError('');
    setSheetSearchTerm('');
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    try {
      setIsDeleting(true);
      setDeleteError('');
      await onDeleteCreative(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'CREATIVE_STILL_LINKED') {
        setDeleteError(`このクリエイティブは${deleteTarget.linkedSheets.length}件のシートに紐づいています。先に紐づけを解除してから削除してください。`);
      } else {
        setDeleteError(message || '削除に失敗しました。');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">クリエイティブ</h2>
        </div>
        {editingCreative ? (
          <button
            type="button"
            onClick={closeEditor}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            一覧に戻る
          </button>
        ) : (
          <button
            onClick={startNewCreative}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5"
          >
            <Plus size={18} />
            新規登録
          </button>
        )}
      </div>

      {editingCreative && (
        <div className="rounded-xl border border-sky-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">
              {editingCreative.version > 1 ? 'クリエイティブ編集' : 'クリエイティブ登録'}
            </h3>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="閉じる"
            >
              <X size={18} />
            </button>
          </div>

          {validationError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {validationError}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">クリエイティブ画像 <span className="text-danger">*</span></label>
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    isDraggingOver
                      ? 'border-primary bg-sky-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-4 flex h-52 items-center justify-center overflow-hidden rounded-lg bg-white">
                    {editingCreative.imageUrl ? (
                      <img src={editingCreative.imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImageIcon size={32} />
                        <span className="text-sm">画像未登録</span>
                        <span className="text-xs">ドラッグ&ドロップまたはボタンで選択</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleImageSelect(file);
                      }
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload size={18} />
                    {isUploadingImage ? 'アップロード中...' : '画像を選択'}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    PNG, JPEG, WebP, GIF, BMP（10MB以下）
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">クリエイティブ名 <span className="text-danger">*</span></label>
                <input
                  value={editingCreative.name}
                  onChange={(event) =>
                    setEditingCreative({
                      ...editingCreative,
                      name: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                画像を登録したあと、下の「紐づけるエントリーシート」から対象シートを選択します。未紐づきのまま保存もできます。
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">メモ</label>
                <textarea
                  rows={8}
                  value={editingCreative.memo || ''}
                  onChange={(event) =>
                    setEditingCreative({
                      ...editingCreative,
                      memo: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-base font-bold text-slate-800">紐づけるエントリーシート</h4>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  選択中 {editingCreative.selectedSheetIds.length}件
                </span>
              </div>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={sheetSearchTerm}
                  onChange={(event) => setSheetSearchTerm(event.target.value)}
                  placeholder="ID / シート名 / メーカー名 / 棚割り名 / 案件名で検索"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>

              <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
                {candidateSheets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    該当するエントリーシートが見つかりません。
                  </div>
                ) : (
                  candidateSheets.map((sheet) => {
                    const linkedCreativeId = linkedCreativeIdBySheetId.get(sheet.id);
                    const isDisabled = Boolean(linkedCreativeId && linkedCreativeId !== editingCreative.id);
                    const isSelected = editingCreative.selectedSheetIds.includes(sheet.id);
                    return (
                      <button
                        key={sheet.id}
                        type="button"
                        onClick={() => toggleSheetSelection(sheet.id)}
                        disabled={isDisabled}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-sky-300 bg-sky-50'
                            : isDisabled
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-800">
                          {(sheet.sheetCode || sheet.id.slice(0, 8))} | {sheet.title || '(タイトル未設定)'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {sheet.manufacturerName} | {sheet.shelfName || '棚割り未設定'} | {sheet.caseName || '案件未設定'}
                        </div>
                        {isDisabled && (
                          <div className="mt-2 text-xs font-semibold text-slate-500">
                            他クリエイティブで使用中
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-base font-bold text-slate-800">選択中のエントリーシート</h4>
              {editingCreative.linkedSheets.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">まだ選択されていません。</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {editingCreative.linkedSheets.map((sheet) => {
                    const sourceSheet = sheetById.get(sheet.id);
                    const canUnlink = sourceSheet ? canModifyCreativeLinkage(sourceSheet) : false;
                    return (
                      <div key={sheet.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {(sheet.sheetCode || sheet.id.slice(0, 8))} | {sheet.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {sheet.manufacturerName} | {sheet.shelfName || '棚割り未設定'} | {sheet.caseName || '案件未設定'}
                          </div>
                          {!canUnlink && (
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              シート詳細で制作に戻してから変更してください
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!canUnlink}
                          onClick={() =>
                            setSelectedSheetIds(
                              editingCreative.selectedSheetIds.filter((id) => id !== sheet.id)
                            )
                          }
                          className={`rounded-full p-2 ${canUnlink ? 'text-slate-400 hover:bg-white hover:text-danger' : 'cursor-not-allowed text-slate-300'}`}
                          title={canUnlink ? '解除' : 'この状態のシートはここでは解除できません'}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={isSaving || isUploadingImage}
              className="rounded-lg bg-primary px-5 py-3 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {!editingCreative && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="クリエイティブ名 / シート名 / ID / メーカー名 / 棚割り名 / 案件名 / メモで検索"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Skeleton loading */}
              <div className="hidden md:block">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                  <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
                </div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-4">
                    <div className="h-16 w-24 bg-slate-200 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse" />
                      <div className="h-3 w-1/4 bg-slate-100 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
                    <div className="h-4 w-20 bg-slate-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="space-y-4 p-4 md:hidden">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="h-20 w-24 shrink-0 bg-slate-200 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 bg-slate-200 rounded animate-pulse" />
                      <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                      <div className="h-3 w-1/3 bg-slate-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredCreatives.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <ImageIcon size={32} className="text-slate-400" />
              </div>
              {searchTerm ? (
                <>
                  <p className="text-lg font-semibold text-slate-700">検索結果がありません</p>
                  <p className="mt-2 text-sm text-slate-500">
                    「{searchTerm}」に一致するクリエイティブが見つかりませんでした。<br />
                    別のキーワードで検索してみてください。
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    <X size={16} />
                    検索をクリア
                  </button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-slate-700">クリエイティブがありません</p>
                  <p className="mt-2 text-sm text-slate-500">
                    まだクリエイティブが登録されていません。<br />
                    新規登録ボタンから最初のクリエイティブを作成しましょう。
                  </p>
                  <button
                    type="button"
                    onClick={startNewCreative}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5"
                  >
                    <Plus size={18} />
                    新規登録
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-28" />
                      <col className="w-[18%]" />
                      <col className="w-[19%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-[13%]" />
                      <col className="w-32" />
                      <col className="w-28" />
                    </colgroup>
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">画像</th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'name' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            クリエイティブ名 {renderSortIcon('name')}
                          </button>
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'sheetCode' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('sheetCode')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            エントリーシート {renderSortIcon('sheetCode')}
                          </button>
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'manufacturerName' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('manufacturerName')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            メーカー名 {renderSortIcon('manufacturerName')}
                          </button>
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'shelfName' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('shelfName')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            棚割り名 {renderSortIcon('shelfName')}
                          </button>
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'caseName' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('caseName')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            案件名 {renderSortIcon('caseName')}
                          </button>
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-bold ${sortKey === 'updatedAt' ? 'text-primary bg-sky-50' : 'text-slate-500'}`}>
                          <button type="button" onClick={() => toggleSort('updatedAt')} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                            最終更新日 {renderSortIcon('updatedAt')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCreatives.map((creative) => {
                        const firstLinkedSheet = getFirstLinkedSheet(creative);
                        return (
                          <tr key={creative.id} className="group border-b border-slate-100 last:border-0 hover:bg-gradient-to-r hover:from-sky-50 hover:to-white transition-all duration-200 cursor-pointer hover:shadow-sm" onClick={() => editCreative(creative)}>
                            <td className="px-4 py-4">
                              <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                                <img src={creative.imageUrl} alt="" className="h-full w-full object-cover" />
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="truncate font-bold text-slate-800" title={creative.name}>{creative.name}</div>
                              <div className="mt-1 text-xs text-slate-500">{creative.linkedSheets.length}件紐づき</div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              {firstLinkedSheet ? (
                                <div className="min-w-0">
                                  <div
                                    className="truncate font-semibold text-slate-800"
                                    title={firstLinkedSheet.title || '(タイトル未設定)'}
                                  >
                                    {firstLinkedSheet.title || '(タイトル未設定)'}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-400">ID: {firstLinkedSheet.sheetCode || firstLinkedSheet.id.slice(0, 8)}</div>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">未紐づき</span>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-slate-700">
                              <div
                                className="truncate"
                                title={getSummaryText(
                                  creative.linkedSheets.length > 0
                                    ? creative.linkedSheets.map((sheet) => sheet.manufacturerName)
                                    : [creative.manufacturerName]
                                )}
                              >
                                {getSummaryText(
                                  creative.linkedSheets.length > 0
                                    ? creative.linkedSheets.map((sheet) => sheet.manufacturerName)
                                    : [creative.manufacturerName]
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-slate-700">
                              <div className="truncate" title={getSummaryText(creative.linkedSheets.map((sheet) => sheet.shelfName))}>
                                {getSummaryText(creative.linkedSheets.map((sheet) => sheet.shelfName))}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-slate-700">
                              <div className="truncate" title={getSummaryText(creative.linkedSheets.map((sheet) => sheet.caseName))}>
                                {getSummaryText(creative.linkedSheets.map((sheet) => sheet.caseName))}
                              </div>
                            </td>
                            <td className="px-4 py-4 align-top text-sm text-slate-700">
                              {new Date(creative.updatedAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    editCreative(creative);
                                  }}
                                  title="編集"
                                  aria-label="編集"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-primary transition-colors hover:bg-blue-100"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    duplicateCreative(creative);
                                  }}
                                  title="複製"
                                  aria-label="複製"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100"
                                >
                                  <Copy size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(creative);
                                  }}
                                  title="削除"
                                  aria-label="削除"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-danger transition-colors hover:bg-red-100"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4 md:hidden">
                {filteredCreatives.map((creative) => {
                  const firstLinkedSheet = getFirstLinkedSheet(creative);
                  return (
                    <div key={creative.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex gap-4">
                        <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                          <img src={creative.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800">{creative.name}</div>
                          {firstLinkedSheet ? (
                            <div className="mt-1">
                              <div className="text-sm text-slate-700">{firstLinkedSheet.title || '(タイトル未設定)'}</div>
                              <div className="text-xs text-slate-400">ID: {firstLinkedSheet.sheetCode || firstLinkedSheet.id.slice(0, 8)}</div>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">未紐づき</div>
                          )}
                          <div className="mt-2 text-xs text-slate-500">
                            {getSummaryText(
                              creative.linkedSheets.length > 0
                                ? creative.linkedSheets.map((sheet) => sheet.manufacturerName)
                                : [creative.manufacturerName]
                            )} / {getSummaryText(creative.linkedSheets.map((sheet) => sheet.shelfName))}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {getSummaryText(creative.linkedSheets.map((sheet) => sheet.caseName))} / 更新: {new Date(creative.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => editCreative(creative)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary bg-blue-50 hover:bg-blue-100 transition-colors"
                        >
                          <Edit size={14} />
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateCreative(creative)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          <Copy size={14} />
                          複製
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(creative)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger bg-red-50 hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={14} />
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-[fadeIn_150ms_ease-out]"
          onClick={() => !isDeleting && setDeleteTarget(null)}
          style={{ animation: 'fadeIn 150ms ease-out' }}
        >
          <div
            className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl animate-[slideUp_200ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideUp 200ms ease-out' }}
          >
            <h3 className="text-lg font-bold text-slate-800">クリエイティブの削除</h3>
            <div className="mt-4">
              <div className="flex items-start gap-4">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img src={deleteTarget.imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{deleteTarget.name}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    紐づきシート: {deleteTarget.linkedSheets.length}件
                  </div>
                </div>
              </div>
              {deleteTarget.linkedSheets.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  このクリエイティブには{deleteTarget.linkedSheets.length}件のシートが紐づいています。
                  削除するには先に紐づけを解除してください。
                </div>
              )}
              {deleteTarget.linkedSheets.length === 0 && (
                <p className="mt-4 text-sm text-slate-600">
                  このクリエイティブを削除してもよろしいですか？この操作は取り消せません。
                </p>
              )}
              {deleteError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError('');
                }}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting || deleteTarget.linkedSheets.length > 0}
                className="rounded-lg bg-danger px-4 py-2.5 font-bold text-white shadow-sm hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
