import React, { useState } from 'react';
import JSZip from 'jszip';
import { EntrySheet, User, UserRole } from '../types';
import { Plus, Copy, Edit3, Trash2, Search, FileWarning, ChevronDown, ChevronUp, Download, CheckSquare, Square, Image as ImageIcon, X, AlertCircle, AlertTriangle, ArrowUpDown } from 'lucide-react';

interface EntryListProps {
  sheets: EntrySheet[];
  currentUser: User;
  onCreate: () => void;
  onEdit: (sheet: EntrySheet, productIndex?: number) => void;
  onDuplicate: (sheet: EntrySheet) => void;
  onDelete: (id: string) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export const EntryList: React.FC<EntryListProps> = ({
  sheets,
  currentUser,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'manufacturer'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFilterBy, setDateFilterBy] = useState<'createdAt' | 'updatedAt' | 'arrivalDate'>('updatedAt');
  const [dateSince, setDateSince] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'since' | 'until'>('since');
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);

  const normalizeSheetStatus = (status: EntrySheet['status'] | string): 'completed' | 'draft' =>
    status === 'completed' ? 'completed' : 'draft';
  const normalizeManufacturerKey = (value: string): string => value.trim();

  const hasText = (value: unknown): boolean =>
    typeof value === 'string' ? value.trim().length > 0 : Boolean(value);

  // Permission check: Can the current user edit/delete this sheet?
  const canModifySheet = (sheet: EntrySheet): boolean => {
    if (currentUser.role === UserRole.ADMIN) return true;
    return (
      normalizeManufacturerKey(sheet.manufacturerName) ===
      normalizeManufacturerKey(currentUser.manufacturerName)
    );
  };

  const getSheetArrivalTimestamp = (sheet: EntrySheet): number | null => {
    const timestamps = sheet.products
      .map((product) => (product.arrivalDate ? new Date(product.arrivalDate).getTime() : NaN))
      .filter((ts) => Number.isFinite(ts));
    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  };

  const getSheetTimestampBy = (
    sheet: EntrySheet,
    field: 'createdAt' | 'updatedAt' | 'arrivalDate'
  ): number | null => {
    if (field === 'createdAt') {
      return new Date(sheet.createdAt).getTime();
    }
    if (field === 'updatedAt') {
      return new Date(sheet.updatedAt).getTime();
    }
    return getSheetArrivalTimestamp(sheet);
  };

  const toggleSort = (nextSortBy: 'updatedAt' | 'manufacturer') => {
    if (sortBy === nextSortBy) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(nextSortBy);
    setSortOrder('asc');
  };

  // Search + Sort
  const filteredSheets = sheets
    .filter((sheet) => {
      const keyword = searchTerm.trim().toLowerCase();
      const matchesSheet =
        !keyword ||
        sheet.title.toLowerCase().includes(keyword) ||
        sheet.manufacturerName.toLowerCase().includes(keyword);
      const matchesProduct = sheet.products.some((product) =>
        (product.productName || '').toLowerCase().includes(keyword)
      );
      if (!(matchesSheet || matchesProduct)) return false;

      if (!dateSince) return true;
      const filterStart = new Date(`${dateSince}T00:00:00`).getTime();
      const filterEnd = new Date(`${dateSince}T23:59:59.999`).getTime();
      const targetTs = getSheetTimestampBy(sheet, dateFilterBy);
      if (targetTs === null) return false;
      if (dateFilterMode === 'since') {
        return targetTs >= filterStart;
      }
      return targetTs <= filterEnd;
    })
    .sort((a, b) => {
      const direction = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'manufacturer') {
        const byManufacturer = a.manufacturerName.localeCompare(b.manufacturerName, 'ja');
        if (byManufacturer !== 0) return byManufacturer * direction;
        return a.creatorName.localeCompare(b.creatorName, 'ja') * direction;
      }

      const aTs = new Date(a.updatedAt).getTime();
      const bTs = new Date(b.updatedAt).getTime();
      return (aTs - bTs) * direction;
    });

  // Toggle Expansion
  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedSheets);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSheets(newExpanded);
  };

  // Selection Logic
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedSheets);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedSheets(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedSheets.size === filteredSheets.length && filteredSheets.length > 0) {
      setSelectedSheets(new Set());
    } else {
      setSelectedSheets(new Set(filteredSheets.map(s => s.id)));
    }
  };

  const executeExport = (targetSheets: EntrySheet[]) => {
    const toSafeCsvCell = (value: unknown): string => {
      const raw = value == null ? '' : String(value);
      const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const formulaGuarded = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
      return `"${formulaGuarded.replace(/"/g, '""')}"`;
    };

    // Flatten data: 1 row per product. Covers all sheet/product fields.
    const csvRows: string[][] = [
      [
        'シートID',
        '状態',
        'タイトル',
        'シート補足情報',
        'メーカー名',
        '作成者ID',
        '作成者',
        '作成日',
        '更新日',
        '担当者メール',
        '担当者電話',
        'シート添付ファイル有無',
        'シート添付ファイル数',
        '商品ID',
        '棚割名',
        '商品メーカー名',
        'JANコード',
        '商品名',
        '商品画像有無',
        'リスク分類',
        '特定成分',
        'キャッチコピー',
        '商品メッセージ',
        '補足事項',
        '商品添付ファイル有無',
        '商品添付ファイル数',
        '幅(mm)',
        '高さ(mm)',
        '奥行(mm)',
        'フェイシング数',
        '店舗到着日',
        '販促物有無',
        '香り・色見本',
        '特殊な陳列什器',
        '販促物サイズ(幅)',
        '販促物サイズ(高さ)',
        '販促物サイズ(奥行)',
        '販促物画像有無',
      ]
    ];

    targetSheets.forEach(sheet => {
      const sheetAttachmentCount = sheet.attachments?.length ?? 0;
      sheet.products.forEach(prod => {
        const productAttachmentCount = prod.productAttachments?.length ?? 0;
        csvRows.push([
          toSafeCsvCell(sheet.id),
          toSafeCsvCell(normalizeSheetStatus(sheet.status) === 'completed' ? '完了' : '下書き'),
          toSafeCsvCell(sheet.title),
          toSafeCsvCell(sheet.notes || ''),
          toSafeCsvCell(sheet.manufacturerName),
          toSafeCsvCell(sheet.creatorId),
          toSafeCsvCell(sheet.creatorName),
          toSafeCsvCell(new Date(sheet.createdAt).toLocaleDateString()),
          toSafeCsvCell(new Date(sheet.updatedAt).toLocaleDateString()),
          toSafeCsvCell(sheet.email),
          toSafeCsvCell(sheet.phoneNumber),
          toSafeCsvCell(sheetAttachmentCount > 0 ? '有り' : '無し'),
          toSafeCsvCell(sheetAttachmentCount),
          toSafeCsvCell(prod.id),
          toSafeCsvCell(prod.shelfName),
          toSafeCsvCell(prod.manufacturerName),
          toSafeCsvCell(prod.janCode),
          toSafeCsvCell(prod.productName),
          toSafeCsvCell(prod.productImage ? '有り' : '無し'),
          toSafeCsvCell(prod.riskClassification),
          toSafeCsvCell((prod.specificIngredients || []).join(' / ')),
          toSafeCsvCell(prod.catchCopy || ''),
          toSafeCsvCell(prod.productMessage || ''),
          toSafeCsvCell(prod.productNotes || ''),
          toSafeCsvCell(productAttachmentCount > 0 ? '有り' : '無し'),
          toSafeCsvCell(productAttachmentCount),
          toSafeCsvCell(prod.width),
          toSafeCsvCell(prod.height),
          toSafeCsvCell(prod.depth),
          toSafeCsvCell(prod.facingCount),
          toSafeCsvCell(prod.arrivalDate || ''),
          toSafeCsvCell(prod.hasPromoMaterial === 'yes' ? '有り' : '無し'),
          toSafeCsvCell(prod.promoSample || ''),
          toSafeCsvCell(prod.specialFixture || ''),
          toSafeCsvCell(prod.promoWidth ?? ''),
          toSafeCsvCell(prod.promoHeight ?? ''),
          toSafeCsvCell(prod.promoDepth ?? ''),
          toSafeCsvCell(prod.promoImage ? '有り' : '無し'),
        ]);
      });
    });

    // BOM for Excel Japanese encoding support
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const csvContent = csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `entry_sheets_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const sanitizeFileName = (name: string) =>
    name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'image';

  const dataUrlToBlob = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid data URL');
    }
    const mimeType = match[1];
    const base64 = match[2];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: mimeType }), mimeType };
  };

  const getExtensionFromMime = (mimeType: string) => {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
    };
    return map[mimeType] || 'img';
  };

  const fetchImageAsBlob = async (src: string) => {
    if (src.startsWith('data:')) {
      return dataUrlToBlob(src);
    }
    try {
      const parsed = new URL(src);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported image URL protocol');
      }
    } catch {
      throw new Error('Invalid image URL');
    }
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${res.status}`);
    }
    const blob = await res.blob();
    return { blob, mimeType: blob.type || 'application/octet-stream' };
  };

  const downloadSelectedProductImages = async () => {
    if (selectedSheets.size === 0) {
      alert('画像をダウンロードするには、対象のエントリーシートを選択してください。');
      return;
    }

    const targetSheets = sheets.filter(s => selectedSheets.has(s.id));
    const images: Array<{ fileName: string; src: string }> = [];

    targetSheets.forEach((sheet) => {
      sheet.products.forEach((prod) => {
        if (!prod.productImage) return;
        const baseName = sanitizeFileName(prod.productName || prod.id);
        const fileName = `${sheet.id}-${prod.id}-${baseName}`;
        images.push({ fileName, src: prod.productImage });
      });
    });

    if (images.length === 0) {
      alert('選択したエントリーシートに商品画像がありません。');
      return;
    }

    try {
      setIsDownloadingImages(true);
      const zip = new JSZip();
      const fetched = await Promise.allSettled(
        images.map(async (img) => {
          const { blob, mimeType } = await fetchImageAsBlob(img.src);
          const ext = getExtensionFromMime(mimeType);
          return { fileName: `${img.fileName}.${ext}`, blob };
        })
      );

      let successCount = 0;
      let failedCount = 0;
      for (const result of fetched) {
        if (result.status === 'fulfilled') {
          zip.file(result.value.fileName, result.value.blob);
          successCount += 1;
        } else {
          failedCount += 1;
        }
      }
      if (successCount === 0) {
        throw new Error('No images could be downloaded');
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `entry_sheet_images_${new Date().toISOString().slice(0, 10)}.zip`;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (failedCount > 0) {
        alert(`一部の画像取得に失敗しました（成功: ${successCount}件 / 失敗: ${failedCount}件）。`);
      }
    } catch (err) {
      alert('画像の一括ダウンロードに失敗しました。');
      console.error(err);
    } finally {
      setIsDownloadingImages(false);
    }
  };

  // Helper to determine product card styling based on completion status
  const getProductStatusStyle = (prod: any) => {
    const isBasicFilled = hasText(prod.productName) && hasText(prod.janCode);
    const isPromoFilled = prod.hasPromoMaterial === 'yes' 
        ? (prod.promoWidth && prod.promoImage) 
        : true;
    
    // Condition 1: Missing basic info or promo info -> RED
    if (!isBasicFilled || !isPromoFilled) {
        return {
            className: "bg-red-50 border border-red-300 hover:bg-red-100",
            icon: <AlertCircle size={16} className="text-danger" />,
            statusText: "必須項目未入力"
        };
    }
    
    // Condition 2: Only Product Image is missing -> YELLOW
    if (!prod.productImage) {
        return {
            className: "bg-yellow-50 border border-yellow-300 hover:bg-yellow-100",
            icon: <AlertTriangle size={16} className="text-warning" />,
            statusText: "画像未登録"
        };
    }
    
    // Condition 3: Complete -> Default (White)
    return {
        className: "bg-white border border-slate-200 hover:border-primary hover:shadow-md",
        icon: null,
        statusText: ""
    };
  };

  // Shared Product Grid Component
  const ProductGrid = ({ sheet }: { sheet: EntrySheet }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {sheet.products.map((prod, idx) => {
            const status = getProductStatusStyle(prod);
            const canEdit = canModifySheet(sheet);
            return (
                <div
                    key={prod.id}
                    className={`${status.className} rounded-lg p-3 flex gap-4 items-center shadow-sm transition-all ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    onClick={() => canEdit && onEdit(sheet, idx)}
                    title={canEdit ? (status.statusText ? `${status.statusText} - クリックして編集` : "クリックして編集") : "編集権限がありません"}
                >
                    <div className="w-16 h-16 bg-slate-100 rounded flex-shrink-0 flex items-center justify-center border border-slate-100 overflow-hidden relative">
                        {prod.productImage ? (
                            <img src={prod.productImage} alt="" className="w-full h-full object-contain" />
                        ) : (
                            <ImageIcon className="text-slate-300" size={24} />
                        )}
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors flex items-center justify-center">
                            <Edit3 size={16} className="text-transparent hover:text-slate-500" />
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-start">
                            <div className="text-xs text-primary font-bold mb-0.5">{prod.shelfName}</div>
                            {status.icon && <div title={status.statusText}>{status.icon}</div>}
                        </div>
                        <div className="text-sm font-bold text-slate-800 truncate" title={prod.productName}>{prod.productName || '(名称未設定)'}</div>
                        <div className="text-xs text-slate-500 font-mono mt-1">
                            店舗着日: {prod.arrivalDate ? new Date(prod.arrivalDate).toLocaleDateString() : '未設定'}
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="w-full sm:w-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">エントリーシート履歴</h2>
            <p className="text-slate-500 text-sm mt-1">
              {selectedSheets.size > 0 
                ? `${selectedSheets.size}件 選択中` 
                : "過去に作成したPOP情報の確認・編集ができます"}
            </p>
        </div>
        <div className="w-full sm:w-auto flex flex-row gap-3">
            <button 
              onClick={() => setShowExportModal(true)}
              className="flex-1 sm:flex-none justify-center bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-3 rounded-lg flex items-center gap-2 font-bold shadow-sm transition-all"
            >
              <Download size={20} />
              CSV出力
            </button>
            <button 
              onClick={downloadSelectedProductImages}
              disabled={isDownloadingImages}
              className={`flex-1 sm:flex-none justify-center px-4 py-3 rounded-lg flex items-center gap-2 font-bold shadow-sm transition-all
                ${isDownloadingImages ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}
              `}
            >
              <ImageIcon size={20} />
              {isDownloadingImages ? '画像準備中...' : '商品画像一括DL'}
            </button>
            <button 
              onClick={onCreate}
              className="flex-1 sm:flex-none justify-center bg-primary hover:bg-sky-600 text-white px-6 py-3 rounded-lg shadow-lg shadow-sky-200 flex items-center gap-2 font-bold transition-all transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              新規作成
            </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm shadow-sm"
            placeholder="シート名、メーカー名、商品名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600">絞り込み</span>
          <select
            value={dateFilterBy}
            onChange={(e) => setDateFilterBy(e.target.value as 'createdAt' | 'updatedAt' | 'arrivalDate')}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
          >
            <option value="createdAt">作成日</option>
            <option value="updatedAt">更新日</option>
            <option value="arrivalDate">店舗到着日</option>
          </select>
          <input
            type="date"
            value={dateSince}
            onChange={(e) => setDateSince(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
          />
          <select
            value={dateFilterMode}
            onChange={(e) => setDateFilterMode(e.target.value as 'since' | 'until')}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
          >
            <option value="since">以降</option>
            <option value="until">以前</option>
          </select>
          {dateSince && (
            <button
              onClick={() => setDateSince('')}
              className="px-2 py-1.5 rounded-md border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
            >
              解除
            </button>
          )}
        </div>
      </div>

      {filteredSheets.length === 0 ? (
          <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            <div className="inline-flex items-center justify-center p-4 bg-slate-100 rounded-full mb-4">
                <FileWarning size={32} className="text-slate-400" />
            </div>
            <p className="text-lg">エントリーシートが見つかりません</p>
            <p className="text-sm mt-2">新規作成ボタンから新しいシートを作成してください。</p>
          </div>
      ) : (
        <>
          {/* MOBILE VIEW: Cards (Visible only on small screens) */}
          <div className="md:hidden space-y-4">
            {/* Mobile Select All Bar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between shadow-sm">
                <button 
                    onClick={toggleSelectAll} 
                    className="flex items-center gap-2 text-slate-700 font-bold"
                >
                    {selectedSheets.size === filteredSheets.length && filteredSheets.length > 0 
                        ? <CheckSquare size={20} className="text-primary" /> 
                        : <Square size={20} className="text-slate-300" />}
                    <span>すべて選択</span>
                </button>
                <span className="text-xs text-slate-500">{filteredSheets.length}件</span>
            </div>

            {/* Mobile Card List */}
            {filteredSheets.map(sheet => {
                const isExpanded = expandedSheets.has(sheet.id);
                const isSelected = selectedSheets.has(sheet.id);

                return (
                    <div key={sheet.id} className={`bg-white rounded-xl border ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-slate-200'} shadow-sm overflow-hidden`}>
                        {/* Card Header */}
                        <div className="p-4 flex gap-3">
                            <div className="pt-1" onClick={(e) => toggleSelect(sheet.id, e)}>
                                {isSelected ? <CheckSquare size={24} className="text-primary" /> : <Square size={24} className="text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0" onClick={() => toggleExpand(sheet.id)}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${normalizeSheetStatus(sheet.status) === 'completed' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                                        {normalizeSheetStatus(sheet.status) === 'completed' ? '完了' : '下書き'}
                                    </span>
                                    <span className="text-xs text-slate-400">{new Date(sheet.updatedAt).toLocaleDateString()}</span>
                                </div>
                                <h3 className="text-base font-bold text-slate-900 leading-tight mb-1">{sheet.title}</h3>
                                <div className="text-xs text-slate-500 truncate">
                                    {sheet.manufacturerName} / {sheet.creatorName}
                                </div>
                            </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                            <div className="flex gap-1">
                                <button
                                    onClick={() => onEdit(sheet)}
                                    disabled={!canModifySheet(sheet)}
                                    className={`p-2 rounded-full border border-transparent shadow-sm ${canModifySheet(sheet) ? 'text-primary hover:bg-white hover:border-slate-200' : 'text-slate-300 cursor-not-allowed'}`}
                                    title={canModifySheet(sheet) ? "編集" : "編集権限がありません"}
                                >
                                    <Edit3 size={18} />
                                </button>
                                <button
                                    onClick={() => onDuplicate(sheet)}
                                    disabled={!canModifySheet(sheet)}
                                    className={`p-2 rounded-full border border-transparent shadow-sm ${canModifySheet(sheet) ? 'text-slate-500 hover:bg-white hover:border-slate-200' : 'text-slate-300 cursor-not-allowed'}`}
                                    title={canModifySheet(sheet) ? "複製" : "複製権限がありません"}
                                >
                                    <Copy size={18} />
                                </button>
                                <button
                                    onClick={() => {
                                        if(window.confirm('本当に削除しますか？')) onDelete(sheet.id);
                                    }}
                                    disabled={!canModifySheet(sheet)}
                                    className={`p-2 rounded-full border border-transparent shadow-sm ${canModifySheet(sheet) ? 'text-slate-400 hover:text-danger hover:bg-white hover:border-slate-200' : 'text-slate-300 cursor-not-allowed'}`}
                                    title={canModifySheet(sheet) ? "削除" : "削除権限がありません"}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <button 
                                onClick={() => toggleExpand(sheet.id)}
                                className="flex items-center gap-1 text-sm text-slate-500 font-medium px-2 py-1"
                            >
                                {sheet.products.length}商品
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                        </div>

                        {/* Mobile Expanded Content */}
                        {isExpanded && (
                            <div className="border-t border-slate-200 p-3 bg-slate-50/50">
                                <ProductGrid sheet={sheet} />
                                <div className="mt-3 text-center">
                                     <button
                                        onClick={() => onEdit(sheet)}
                                        disabled={!canModifySheet(sheet)}
                                        className={`w-full py-2 rounded-lg text-sm font-bold shadow-sm ${canModifySheet(sheet) ? 'bg-white border border-primary text-primary' : 'bg-slate-100 border border-slate-300 text-slate-400 cursor-not-allowed'}`}
                                     >
                                        {canModifySheet(sheet) ? '詳細編集画面へ' : '編集権限がありません'}
                                     </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
          </div>

          {/* DESKTOP VIEW: Table (Hidden on mobile) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 table-fixed">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 w-12 text-center">
                      <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                        {selectedSheets.size === filteredSheets.length && filteredSheets.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-24">状態</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">タイトル</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-48">
                      <button
                        onClick={() => toggleSort('manufacturer')}
                        className={`inline-flex items-center gap-1 hover:text-slate-700 ${
                          sortBy === 'manufacturer' ? 'text-slate-700' : ''
                        }`}
                        title="メーカー / 更新者の並び順を切り替え"
                      >
                        <span>メーカー / 更新者</span>
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-32">
                      <button
                        onClick={() => toggleSort('updatedAt')}
                        className={`inline-flex items-center gap-1 hover:text-slate-700 ${
                          sortBy === 'updatedAt' ? 'text-slate-700' : ''
                        }`}
                        title="更新日の並び順を切り替え"
                      >
                        <span>更新日</span>
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-40">操作</th>
                    <th scope="col" className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredSheets.map((sheet) => {
                     const isExpanded = expandedSheets.has(sheet.id);
                     const isSelected = selectedSheets.has(sheet.id);

                     return (
                      <React.Fragment key={sheet.id}>
                        <tr 
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                          onClick={() => toggleExpand(sheet.id)}
                        >
                          <td className="px-4 py-4 text-center" onClick={(e) => toggleSelect(sheet.id, e)}>
                             <div className="text-primary cursor-pointer inline-block">
                               {isSelected ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300" />}
                             </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {normalizeSheetStatus(sheet.status) === 'completed' ? (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                完了
                              </span>
                            ) : (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-800">
                                下書き
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-900 line-clamp-1">{sheet.title}</div>
                            <div className="text-xs text-slate-500">{sheet.products.length} 商品登録済</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-slate-900 line-clamp-1">{sheet.manufacturerName}</div>
                            <div className="text-xs text-slate-500 line-clamp-1">{sheet.creatorName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {new Date(sheet.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              <button
                                  onClick={() => onEdit(sheet)}
                                  disabled={!canModifySheet(sheet)}
                                  className={`p-2 rounded ${canModifySheet(sheet) ? 'text-primary hover:text-sky-700 hover:bg-sky-100' : 'text-slate-300 cursor-not-allowed'}`}
                                  title={canModifySheet(sheet) ? "編集" : "編集権限がありません"}
                              >
                                  <Edit3 size={18} />
                              </button>
                              <button
                                  onClick={() => onDuplicate(sheet)}
                                  disabled={!canModifySheet(sheet)}
                                  className={`p-2 rounded ${canModifySheet(sheet) ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-300 cursor-not-allowed'}`}
                                  title={canModifySheet(sheet) ? "複製" : "複製権限がありません"}
                              >
                                  <Copy size={18} />
                              </button>
                              <button
                                  onClick={() => {
                                      if(window.confirm('本当に削除しますか？この操作は取り消せません。')) {
                                          onDelete(sheet.id);
                                      }
                                  }}
                                  disabled={!canModifySheet(sheet)}
                                  className={`p-2 rounded ${canModifySheet(sheet) ? 'text-slate-400 hover:text-danger hover:bg-red-50' : 'text-slate-300 cursor-not-allowed'}`}
                                  title={canModifySheet(sheet) ? "削除" : "削除権限がありません"}
                              >
                                  <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 text-slate-400">
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </td>
                        </tr>
                        
                        {/* Expanded Content Desktop */}
                        {isExpanded && (
                          <tr className="bg-slate-50 shadow-inner">
                              <td colSpan={7} className="px-4 sm:px-6 py-4">
                                  <ProductGrid sheet={sheet} />
                                  <div className="mt-4 text-right">
                                       <button
                                          onClick={() => onEdit(sheet)}
                                          disabled={!canModifySheet(sheet)}
                                          className={`text-sm font-bold ${canModifySheet(sheet) ? 'text-primary hover:underline' : 'text-slate-400 cursor-not-allowed'}`}
                                       >
                                          {canModifySheet(sheet) ? 'すべての詳細を確認・編集する →' : '編集権限がありません'}
                                       </button>
                                  </div>
                              </td>
                          </tr>
                        )}
                      </React.Fragment>
                     );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {hasMore && !searchTerm.trim() && !dateSince && (
        <div className="flex justify-center">
          <button
            onClick={() => onLoadMore?.()}
            disabled={isLoadingMore}
            className={`px-6 py-3 rounded-lg font-bold shadow-sm transition-all ${
              isLoadingMore
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isLoadingMore ? '読み込み中...' : 'さらに30件を読み込む'}
          </button>
        </div>
      )}

      {/* CSV Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-slate-800">CSV出力オプション</h3>
                    <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                
                <p className="text-slate-600 mb-6">
                    出力するデータの対象を選択してください。
                </p>

                <div className="space-y-3">
                    <button 
                        onClick={() => executeExport(filteredSheets)}
                        className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-primary transition-all group"
                    >
                        <div className="text-left">
                            <div className="font-bold text-slate-800 group-hover:text-primary">表示中のデータをすべて出力</div>
                            <div className="text-sm text-slate-500">フィルター適用後の全データ ({filteredSheets.length}件)</div>
                        </div>
                        <Download size={20} className="text-slate-400 group-hover:text-primary" />
                    </button>

                    <button 
                        onClick={() => executeExport(sheets.filter(s => selectedSheets.has(s.id)))}
                        disabled={selectedSheets.size === 0}
                        className={`w-full flex items-center justify-between p-4 border rounded-lg transition-all
                            ${selectedSheets.size > 0 
                                ? 'border-slate-200 hover:bg-slate-50 hover:border-primary cursor-pointer group' 
                                : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'}
                        `}
                    >
                        <div className="text-left">
                            <div className={`font-bold ${selectedSheets.size > 0 ? 'text-slate-800 group-hover:text-primary' : 'text-slate-400'}`}>
                                選択した項目のみ出力
                            </div>
                            <div className="text-sm text-slate-500">
                                {selectedSheets.size > 0 ? `チェックボックスで選択したデータ (${selectedSheets.size}件)` : 'データが選択されていません'}
                            </div>
                        </div>
                        <CheckSquare size={20} className={selectedSheets.size > 0 ? "text-slate-400 group-hover:text-primary" : "text-slate-300"} />
                    </button>
                </div>

                <div className="mt-6 text-right">
                    <button 
                        onClick={() => setShowExportModal(false)}
                        className="text-slate-500 hover:text-slate-700 font-medium px-4 py-2"
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
