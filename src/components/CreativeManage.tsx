import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Edit, Image as ImageIcon, Link, Plus, Search, Trash2, Type, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../services/apiClient';
import { dataService } from '../services/dataService';
import { Creative, CreativeCandidateSheet, CreativeLinkedSheet, EntrySheet, User } from '../types';

interface CreativeManageProps {
  creatives: Creative[];
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
  manufacturerName: '',
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
  const [candidateSheets, setCandidateSheets] = useState<CreativeCandidateSheet[]>([]);
  const [selectedSheetDetails, setSelectedSheetDetails] = useState<CreativeCandidateSheet[]>([]);
  const [isLoadingCandidateSheets, setIsLoadingCandidateSheets] = useState(false);
  const [candidateSheetsError, setCandidateSheetsError] = useState('');
  const [editingCreative, setEditingCreative] = useState<CreativeDraft | null>(null);
  const [originalCreative, setOriginalCreative] = useState<CreativeDraft | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [nameError, setNameError] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Creative | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showUnlinkedConfirm, setShowUnlinkedConfirm] = useState(false);

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

  const candidateSheetById = useMemo(() => {
    const map = new Map<string, CreativeCandidateSheet>();
    selectedSheetDetails.forEach((sheet) => map.set(sheet.id, sheet));
    candidateSheets.forEach((sheet) => map.set(sheet.id, sheet));
    return map;
  }, [candidateSheets, selectedSheetDetails]);
  const linkedCreativeIdBySheetId = useMemo(() => {
    const map = new Map<string, string>();
    creatives.forEach((creative) => {
      creative.linkedSheets.forEach((sheet) => {
        map.set(sheet.id, creative.id);
      });
    });
    selectedSheetDetails.forEach((sheet) => {
      if (sheet.linkedCreativeId) map.set(sheet.id, sheet.linkedCreativeId);
    });
    candidateSheets.forEach((sheet) => {
      if (sheet.linkedCreativeId) map.set(sheet.id, sheet.linkedCreativeId);
    });
    return map;
  }, [candidateSheets, creatives, selectedSheetDetails]);
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

  useEffect(() => {
    if (!editingCreative) {
      setSelectedSheetDetails([]);
      setCandidateSheetsError('');
      return;
    }
    const selectedIds = editingCreative.selectedSheetIds;
    if (selectedIds.length === 0) {
      setSelectedSheetDetails([]);
      return;
    }

    let mounted = true;
    void dataService
      .searchCreativeCandidateSheets({
        ids: selectedIds,
        limit: selectedIds.length,
      })
      .then((result) => {
        if (!mounted) return;
        setSelectedSheetDetails(result.items);
      })
      .catch((error) => {
        console.error('Failed to load selected creative sheet details:', error);
      });

    return () => {
      mounted = false;
    };
  }, [editingCreative?.selectedSheetIds]);

  useEffect(() => {
    if (!editingCreative) return;
    const query = sheetSearchTerm.trim();
    if (!query) {
      setCandidateSheets([]);
      setIsLoadingCandidateSheets(false);
      setCandidateSheetsError('');
      return;
    }

    let mounted = true;
    setIsLoadingCandidateSheets(true);
    setCandidateSheetsError('');
    void dataService
      .searchCreativeCandidateSheets({
        query,
        limit: 30,
      })
      .then((result) => {
        if (!mounted) return;
        setCandidateSheets(result.items);
      })
      .catch((error) => {
        console.error('Failed to search creative candidate sheets:', error);
        if (!mounted) return;
        setCandidateSheets([]);
        setCandidateSheetsError(error instanceof Error ? error.message : 'エントリーシート検索に失敗しました。');
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingCandidateSheets(false);
      });

    return () => {
      mounted = false;
    };
  }, [editingCreative, sheetSearchTerm]);

  const startNewCreative = () => {
    const newDraft: CreativeDraft = {
      id: uuidv4(),
      version: 1,
      manufacturerName: '',
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
    setCandidateSheets([]);
    setCandidateSheetsError('');
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
    setCandidateSheets([]);
    setCandidateSheetsError('');
    setValidationError('');
  };

  const duplicateCreative = (creative: Creative) => {
    const draft = buildDuplicateCreativeDraft(creative, currentUser);
    setEditingCreative(draft);
    setOriginalCreative(draft);
    setSheetSearchTerm('');
    setCandidateSheets([]);
    setCandidateSheetsError('');
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
      .map((id) => candidateSheetById.get(id) || editingCreative.linkedSheets.find((sheet) => sheet.id === id))
      .filter((sheet): sheet is CreativeLinkedSheet => Boolean(sheet))
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
    setEditingCreative({
      ...editingCreative,
      manufacturerName: linkedSheets[0]?.manufacturerName || '',
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
    setImageError('');
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setImageError('対応形式: PNG, JPEG, WebP, GIF, BMP');
      return;
    }
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setImageError('10MB以下の画像を選択してください');
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
      setImageError('');
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'アップロード失敗');
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

    // フィールドレベルのバリデーション
    let hasError = false;
    setNameError('');
    setImageError('');
    setValidationError('');

    if (!editingCreative.name.trim()) {
      setNameError('クリエイティブ名を入力してください');
      hasError = true;
    }
    if (!editingCreative.imageUrl.trim()) {
      setImageError('画像をアップロードしてください');
      hasError = true;
    }
    if (hasError) {
      return;
    }

    if (editingCreative.linkedSheets.length === 0) {
      // シート未紐づけの場合は確認ダイアログを表示
      setShowUnlinkedConfirm(true);
      return;
    }

    try {
      setIsSaving(true);
      await onSaveCreative({
        ...editingCreative,
        manufacturerName:
          editingCreative.linkedSheets[0]?.manufacturerName ||
          editingCreative.manufacturerName ||
          currentUser.manufacturerName ||
          '',
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
      } else if (message === 'SHEET_WORKFLOW_LOCKED') {
        setValidationError('確認待ち・差し戻し・承認済みのシートに紐づくクリエイティブは、シート詳細で制作に戻してから変更してください。');
      } else {
        setValidationError(message || '保存に失敗しました。');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // シート未紐づけ確認後の保存処理
  const handleConfirmSaveWithoutLinkage = async () => {
    if (!editingCreative || isSaving) return;
    setShowUnlinkedConfirm(false);

    try {
      setIsSaving(true);
      await onSaveCreative({
        ...editingCreative,
        manufacturerName: editingCreative.manufacturerName || '',
        linkedSheets: [],
      });
      closeEditor(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'VERSION_CONFLICT') {
        setValidationError('他のユーザーが更新しました。画面を再読み込みして最新データを取得してください。');
      } else if (message === 'CREATIVE_REQUIRED_FIELDS') {
        setValidationError('必須項目を入力してください。');
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
    setNameError('');
    setImageError('');
    setShowUnlinkedConfirm(false);
    setSheetSearchTerm('');
    setCandidateSheets([]);
    setCandidateSheetsError('');
    setSelectedSheetDetails([]);
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
        <div className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm sm:p-6">
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

          {/* ステップインジケーター */}
          <div className="mt-4 flex items-center justify-center gap-2 sm:gap-4">
            {/* Step 1: 画像 */}
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                editingCreative.imageUrl
                  ? 'bg-emerald-500 text-white'
                  : 'bg-primary text-white'
              }`}>
                {editingCreative.imageUrl ? <Check size={16} /> : '1'}
              </div>
              <span className={`hidden text-sm font-medium sm:inline ${
                editingCreative.imageUrl ? 'text-emerald-600' : 'text-slate-700'
              }`}>画像</span>
            </div>
            <div className={`h-0.5 w-8 sm:w-12 ${editingCreative.imageUrl ? 'bg-emerald-300' : 'bg-slate-200'}`} />

            {/* Step 2: 基本情報 */}
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                editingCreative.imageUrl && editingCreative.name.trim()
                  ? 'bg-emerald-500 text-white'
                  : editingCreative.imageUrl
                    ? 'bg-primary text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {editingCreative.imageUrl && editingCreative.name.trim() ? <Check size={16} /> : '2'}
              </div>
              <span className={`hidden text-sm font-medium sm:inline ${
                editingCreative.imageUrl && editingCreative.name.trim()
                  ? 'text-emerald-600'
                  : editingCreative.imageUrl
                    ? 'text-slate-700'
                    : 'text-slate-400'
              }`}>基本情報</span>
            </div>
            <div className={`h-0.5 w-8 sm:w-12 ${
              editingCreative.imageUrl && editingCreative.name.trim() ? 'bg-emerald-300' : 'bg-slate-200'
            }`} />

            {/* Step 3: シート紐づけ */}
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                editingCreative.selectedSheetIds.length > 0
                  ? 'bg-emerald-500 text-white'
                  : editingCreative.imageUrl && editingCreative.name.trim()
                    ? 'bg-primary text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {editingCreative.selectedSheetIds.length > 0 ? <Check size={16} /> : '3'}
              </div>
              <span className={`hidden text-sm font-medium sm:inline ${
                editingCreative.selectedSheetIds.length > 0
                  ? 'text-emerald-600'
                  : editingCreative.imageUrl && editingCreative.name.trim()
                    ? 'text-slate-700'
                    : 'text-slate-400'
              }`}>シート紐づけ</span>
              <span className="text-xs text-slate-400">(任意)</span>
            </div>
          </div>

          {validationError && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {validationError}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  editingCreative.imageUrl ? 'bg-emerald-500 text-white' : 'bg-primary text-white'
                }`}>
                  {editingCreative.imageUrl ? <Check size={12} /> : '1'}
                </span>
                <span className="text-sm font-bold text-slate-700">Step 1: 画像をアップロード</span>
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">クリエイティブ画像 <span className="text-danger">*</span></label>
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                    imageError
                      ? 'border-danger bg-rose-50'
                      : isDraggingOver
                        ? 'border-primary bg-sky-50'
                        : editingCreative.imageUrl
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="relative mb-4 flex h-52 items-center justify-center overflow-hidden rounded-lg bg-white">
                    {isUploadingImage ? (
                      <div className="flex flex-col items-center gap-3 text-slate-500">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
                        <span className="text-sm font-medium">アップロード中...</span>
                      </div>
                    ) : editingCreative.imageUrl ? (
                      <>
                        <img src={editingCreative.imageUrl} alt="" className="h-full w-full object-contain" />
                        <div className="absolute right-2 top-2 rounded-full bg-emerald-500 p-1 text-white">
                          <Check size={14} />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImageIcon size={32} />
                        <span className="text-sm">画像未登録</span>
                        <span className="text-xs">ドラッグ&ドロップまたはボタンで選択</span>
                      </div>
                    )}
                  </div>

                  {/* インラインエラー表示 */}
                  {imageError && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">
                      <X size={16} className="flex-shrink-0" />
                      <span>{imageError}</span>
                    </div>
                  )}

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
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      editingCreative.imageUrl
                        ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        : 'border-primary bg-primary text-white hover:bg-sky-600'
                    }`}
                  >
                    <Upload size={18} />
                    {isUploadingImage ? 'アップロード中...' : editingCreative.imageUrl ? '画像を変更' : '画像を選択'}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-500">
                    PNG, JPEG, WebP, GIF, BMP（10MB以下）
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="mb-3 flex items-center gap-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  editingCreative.imageUrl && editingCreative.name.trim()
                    ? 'bg-emerald-500 text-white'
                    : editingCreative.imageUrl
                      ? 'bg-primary text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}>
                  {editingCreative.imageUrl && editingCreative.name.trim() ? <Check size={12} /> : '2'}
                </span>
                <span className="text-sm font-bold text-slate-700">Step 2: 基本情報を入力</span>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">クリエイティブ名 <span className="text-danger">*</span></label>
                <input
                  value={editingCreative.name}
                  onChange={(event) => {
                    setEditingCreative({
                      ...editingCreative,
                      name: event.target.value,
                    });
                    if (nameError) setNameError('');
                  }}
                  className={`w-full rounded-lg border bg-white px-4 py-3 text-sm text-slate-800 shadow-sm transition-all focus:ring-2 focus:outline-none ${
                    nameError
                      ? 'border-danger focus:border-danger focus:ring-danger/20'
                      : 'border-slate-300 focus:border-primary focus:ring-primary/20'
                  }`}
                />
                {nameError && (
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-danger">
                    <X size={14} />
                    {nameError}
                  </p>
                )}
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

          {/* Step 3: シート紐づけ */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                editingCreative.selectedSheetIds.length > 0
                  ? 'bg-emerald-500 text-white'
                  : editingCreative.imageUrl && editingCreative.name.trim()
                    ? 'bg-primary text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}>
                {editingCreative.selectedSheetIds.length > 0 ? <Check size={12} /> : '3'}
              </span>
              <span className="text-sm font-bold text-slate-700">Step 3: エントリーシートを紐づけ</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">任意</span>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              シートを紐づけなくても保存できます。複数メーカーのシートを選択できます。
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            {/* 選択済みシート表示 */}
            {editingCreative.linkedSheets.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">
                    選択済み ({editingCreative.linkedSheets.length}件)
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    メーカー: {new Set(editingCreative.linkedSheets.map((sheet) => sheet.manufacturerName).filter(Boolean)).size}件
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingCreative.linkedSheets.map((sheet) => {
                    const sourceSheet = candidateSheetById.get(sheet.id);
                    const canUnlink = sourceSheet ? canModifyCreativeLinkage(sourceSheet) : false;
                    return (
                      <div
                        key={sheet.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                          canUnlink
                            ? 'border-sky-200 bg-sky-50 text-sky-800'
                            : 'border-slate-200 bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Check size={14} className="text-sky-500" />
                        <span className="max-w-[200px] truncate font-medium">
                          {sheet.sheetCode || sheet.id.slice(0, 8)}
                        </span>
                        {canUnlink ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSheetIds(
                                editingCreative.selectedSheetIds.filter((id) => id !== sheet.id)
                              )
                            }
                            className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-sky-100 hover:text-danger"
                            title="解除"
                          >
                            <X size={14} />
                          </button>
                        ) : (
                          <span className="ml-1 text-xs text-slate-400" title="変更不可">🔒</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 検索フォーム */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={sheetSearchTerm}
                onChange={(event) => setSheetSearchTerm(event.target.value)}
                placeholder="シートを検索（ID / シート名 / メーカー名 / 棚割り名 / 案件名）"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
              />
            </div>

            <p className="mt-2 text-xs text-slate-500">
              メーカー制限なしで検索できます。
            </p>

            {/* 検索結果 */}
            <div className="mt-4 max-h-60 space-y-2 overflow-auto pr-1 sm:max-h-80">
              {!sheetSearchTerm.trim() ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  <Search size={24} className="mx-auto mb-2 text-slate-300" />
                  キーワードを入力して検索
                </div>
              ) : isLoadingCandidateSheets ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-primary" />
                  検索中...
                </div>
              ) : candidateSheetsError ? (
                <div className="rounded-lg border border-dashed border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
                  {candidateSheetsError}
                </div>
              ) : candidateSheets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  該当するシートが見つかりません
                </div>
              ) : (
                candidateSheets.map((sheet) => {
                  const linkedCreativeId = linkedCreativeIdBySheetId.get(sheet.id);
                  const isWorkflowLocked = !canModifyCreativeLinkage(sheet);
                  const isLinkedToOther = Boolean(linkedCreativeId && linkedCreativeId !== editingCreative.id);
                  const isDisabled = isWorkflowLocked || isLinkedToOther;
                  const isSelected = editingCreative.selectedSheetIds.includes(sheet.id);
                  return (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => toggleSheetSelection(sheet.id)}
                      disabled={isDisabled}
                      className={`group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-sky-300 bg-sky-50'
                          : isDisabled
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {/* チェックボックス風アイコン */}
                      <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? 'border-sky-500 bg-sky-500 text-white'
                          : isDisabled
                            ? 'border-slate-300 bg-slate-200 text-slate-400'
                            : 'border-slate-300 bg-white group-hover:border-slate-400'
                      }`}>
                        {isSelected && <Check size={12} />}
                        {isDisabled && <span className="text-xs">🔒</span>}
                      </div>

                      {/* シート情報 */}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-semibold ${isDisabled ? 'text-slate-400' : 'text-slate-800'}`}>
                          {sheet.sheetCode || sheet.id.slice(0, 8)} | {sheet.title || '(タイトル未設定)'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {sheet.manufacturerName} | {sheet.shelfName || '棚割り未設定'} | {sheet.caseName || '案件未設定'}
                        </div>
                        {isWorkflowLocked ? (
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            下書き・確認待ち・差し戻し・承認済みのシートは選択できません
                          </div>
                        ) : isLinkedToOther ? (
                          <div className="mt-1 text-xs font-medium text-amber-600">
                            他のクリエイティブで使用中
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm sm:w-auto"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={isSaving || isUploadingImage}
              className="w-full rounded-lg bg-primary px-5 py-3 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg sm:w-auto"
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

      {/* Unlinked Save Confirmation Modal */}
      {showUnlinkedConfirm && editingCreative && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !isSaving && setShowUnlinkedConfirm(false)}
          style={{ animation: 'fadeIn 150ms ease-out' }}
        >
          <div
            className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'slideUp 200ms ease-out' }}
          >
            <h3 className="text-lg font-bold text-slate-800">シート未紐づけの確認</h3>
            <div className="mt-4">
              <div className="flex items-start gap-4">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img src={editingCreative.imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{editingCreative.name}</div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">エントリーシートが紐づいていません</p>
                <p className="mt-1">このまま保存すると、どのシートにも紐づかない状態で保存されます。後から編集画面で追加できます。</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUnlinkedConfirm(false)}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                戻って紐づける
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSaveWithoutLinkage()}
                disabled={isSaving}
                className="rounded-lg bg-primary px-4 py-2.5 font-bold text-white shadow-sm hover:bg-sky-600 disabled:opacity-60"
              >
                {isSaving ? '保存中...' : 'このまま保存'}
              </button>
            </div>
          </div>
        </div>
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
