import React, { useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Edit, Image as ImageIcon, Plus, Search, Trash2, Upload, X } from 'lucide-react';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [sheetSearchTerm, setSheetSearchTerm] = useState('');
  const [editingCreative, setEditingCreative] = useState<CreativeDraft | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
  const manufacturerOptions = useMemo(() => {
    const values = new Set<string>();
    if (currentUser.manufacturerName) values.add(currentUser.manufacturerName);
    sheets.forEach((sheet) => {
      if (sheet.manufacturerName) values.add(sheet.manufacturerName);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [currentUser.manufacturerName, sheets]);

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
    setEditingCreative({
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
    });
    setSheetSearchTerm('');
    setValidationError('');
  };

  const editCreative = (creative: Creative) => {
    setEditingCreative({
      ...creative,
      selectedSheetIds: creative.linkedSheets.map((sheet) => sheet.id),
    });
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
      setEditingCreative(null);
      setValidationError('');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">クリエイティブ</h2>
          <p className="mt-1 text-sm text-slate-500">画像1枚単位でクリエイティブを管理し、エントリーシートへ紐づけます。</p>
        </div>
        <button
          onClick={startNewCreative}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5"
        >
          <Plus size={18} />
          新規登録
        </button>
      </div>

      {editingCreative && (
        <div className="rounded-xl border border-sky-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">
              {editingCreative.version > 1 ? 'クリエイティブ編集' : 'クリエイティブ登録'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setEditingCreative(null);
                setValidationError('');
              }}
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

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">クリエイティブ画像 <span className="text-danger">*</span></label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex h-52 items-center justify-center overflow-hidden rounded-lg bg-white">
                    {editingCreative.imageUrl ? (
                      <img src={editingCreative.imageUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ImageIcon size={32} />
                        <span className="text-sm">画像未登録</span>
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
                </div>
              </div>

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
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">メーカー <span className="text-danger">*</span></label>
                <select
                  value={editingCreative.manufacturerName}
                  onChange={(event) =>
                    setEditingCreative({
                      ...editingCreative,
                      manufacturerName: event.target.value,
                    })
                  }
                  disabled={editingCreative.selectedSheetIds.length > 0}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">メーカーを選択</option>
                  {manufacturerOptions.map((manufacturerName) => (
                    <option key={manufacturerName} value={manufacturerName}>
                      {manufacturerName}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-slate-500">
                  エントリーシート未紐づきでも保存できます。シートを選択するとメーカーは自動で決まります。
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">メモ</label>
                <textarea
                  rows={4}
                  value={editingCreative.memo || ''}
                  onChange={(event) =>
                    setEditingCreative({
                      ...editingCreative,
                      memo: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
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
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm"
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
                    {editingCreative.linkedSheets.map((sheet) => (
                      <div key={sheet.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {(sheet.sheetCode || sheet.id.slice(0, 8))} | {sheet.title}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {sheet.manufacturerName} | {sheet.shelfName || '棚割り未設定'} | {sheet.caseName || '案件未設定'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSheetIds(
                              editingCreative.selectedSheetIds.filter((id) => id !== sheet.id)
                            )
                          }
                          className="rounded-full p-2 text-slate-400 hover:bg-white hover:text-danger"
                          title="解除"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingCreative(null);
                setValidationError('');
              }}
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
              className="rounded-lg bg-primary px-5 py-3 font-bold text-white shadow-lg shadow-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="クリエイティブ名 / シート名 / ID / メーカー名 / 棚割り名 / 案件名 / メモで検索"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm"
          />
        </div>
      </div>

      {!isLoading && filteredCreatives.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          クリエイティブが見つかりません
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-[1320px] w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">画像</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('name')} className="inline-flex items-center gap-1">
                        クリエイティブ名 <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('sheetCode')} className="inline-flex items-center gap-1">
                        エントリーシート <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('manufacturerName')} className="inline-flex items-center gap-1">
                        メーカー名 <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('shelfName')} className="inline-flex items-center gap-1">
                        棚割り名 <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('caseName')} className="inline-flex items-center gap-1">
                        案件名 <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">
                      <button type="button" onClick={() => toggleSort('updatedAt')} className="inline-flex items-center gap-1">
                        最終更新日 <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCreatives.map((creative) => {
                    const firstLinkedSheet = getFirstLinkedSheet(creative);
                    return (
                      <tr key={creative.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                            <img src={creative.imageUrl} alt="" className="h-full w-full object-cover" />
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="font-bold text-slate-800">{creative.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{creative.linkedSheets.length}件紐づき</div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {firstLinkedSheet ? `${firstLinkedSheet.sheetCode || firstLinkedSheet.id.slice(0, 8)} | ${firstLinkedSheet.title}` : '未紐づき'}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {getSummaryText(
                            creative.linkedSheets.length > 0
                              ? creative.linkedSheets.map((sheet) => sheet.manufacturerName)
                              : [creative.manufacturerName]
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {getSummaryText(creative.linkedSheets.map((sheet) => sheet.shelfName))}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {getSummaryText(creative.linkedSheets.map((sheet) => sheet.caseName))}
                        </td>
                        <td className="px-4 py-4 align-top text-sm text-slate-700">
                          {new Date(creative.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => editCreative(creative)}
                              className="rounded-lg p-2 text-primary hover:bg-blue-50"
                              title="編集"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('本当に削除しますか？')) {
                                  void onDeleteCreative(creative.id);
                                }
                              }}
                              className="rounded-lg p-2 text-danger hover:bg-red-50"
                              title="削除"
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
                      <div className="mt-1 text-xs text-slate-500">
                        {firstLinkedSheet ? `${firstLinkedSheet.sheetCode || firstLinkedSheet.id.slice(0, 8)} | ${firstLinkedSheet.title}` : '未紐づき'}
                      </div>
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
                      className="rounded-lg p-2 text-primary hover:bg-blue-50"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('本当に削除しますか？')) {
                          void onDeleteCreative(creative.id);
                        }
                      }}
                      className="rounded-lg p-2 text-danger hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
