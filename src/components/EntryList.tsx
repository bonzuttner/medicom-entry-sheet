import React, { useState } from 'react';
import JSZip from 'jszip';
import { EntrySheet, User, UserRole } from '../types';
import { Plus, Copy, Edit3, Trash2, Search, FileWarning, ChevronDown, ChevronUp, Download, CheckSquare, Square, Image as ImageIcon, X, AlertCircle, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getCurrentAssigneeLabel, getWorkflowStatusView } from '../lib/sheetWorkflow';

interface EntryListProps {
  sheets: EntrySheet[];
  currentUser: User;
  onCreate: () => void;
  onEdit: (sheet: EntrySheet, productIndex?: number) => void;
  onDuplicate: (sheet: EntrySheet) => void;
  onDelete: (id: string) => Promise<void> | void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isLoading?: boolean;
  totalCount?: number;
}

const SkeletonPulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`} />
);

const SkeletonRow: React.FC = () => (
  <tr className="border-b border-slate-100">
    <td className="sticky left-0 z-30 w-12 px-4 py-4 bg-white"><SkeletonPulse className="w-5 h-5 mx-auto" /></td>
    <td className="w-24 px-2 py-4"><SkeletonPulse className="w-16 h-4" /></td>
    <td className="px-4 py-4"><SkeletonPulse className="w-16 h-5 rounded-full" /></td>
    <td className="px-6 py-4"><SkeletonPulse className="w-48 h-5 mb-2" /><SkeletonPulse className="w-20 h-3" /></td>
    <td className="px-4 py-4"><SkeletonPulse className="w-24 h-4" /></td>
    <td className="px-4 py-4"><SkeletonPulse className="w-20 h-4" /></td>
    <td className="px-4 py-4"><SkeletonPulse className="w-24 h-4 mb-1" /><SkeletonPulse className="w-16 h-3" /></td>
    <td className="px-4 py-4"><SkeletonPulse className="w-16 h-4" /></td>
    <td className="px-4 py-4"><div className="flex justify-end gap-2"><SkeletonPulse className="w-8 h-8 rounded" /><SkeletonPulse className="w-8 h-8 rounded" /><SkeletonPulse className="w-8 h-8 rounded" /></div></td>
    <td className="px-2"><SkeletonPulse className="w-5 h-5" /></td>
  </tr>
);

const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4">
    <div className="flex gap-3">
      <SkeletonPulse className="w-6 h-6 mt-1" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between"><SkeletonPulse className="w-16 h-5 rounded-full" /><SkeletonPulse className="w-20 h-4" /></div>
        <SkeletonPulse className="w-24 h-3" />
        <SkeletonPulse className="w-3/4 h-5" />
        <SkeletonPulse className="w-1/2 h-4" />
        <SkeletonPulse className="w-2/3 h-4" />
      </div>
    </div>
    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between">
      <div className="flex gap-2"><SkeletonPulse className="w-9 h-9 rounded-full" /><SkeletonPulse className="w-9 h-9 rounded-full" /><SkeletonPulse className="w-9 h-9 rounded-full" /></div>
      <SkeletonPulse className="w-16 h-6" />
    </div>
  </div>
);

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
  isLoading = false,
  totalCount = 0,
}) => {
  const pageTitleClass = 'text-2xl font-bold tracking-tight text-slate-800';
  const pageSubtitleClass = 'mt-1 text-sm text-slate-500';
  const toolbarTertiaryButtonClass =
    'flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50';
  const toolbarAccentButtonClass =
    'flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 font-semibold text-sky-700 shadow-sm transition-all hover:bg-sky-100';
  const toolbarPrimaryButtonClass =
    'flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-white shadow-lg shadow-sky-200 transition-all hover:bg-sky-600 hover:-translate-y-0.5';
  const searchInputClass =
    'block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm leading-5 shadow-sm placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';
  const filterControlClass =
    'rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700';
  const getLegacyShortSheetId = (id: string): string => id.slice(0, 8);
  const getDisplaySheetId = (sheet: EntrySheet): string =>
    sheet.sheetCode?.trim() || getLegacyShortSheetId(sheet.id);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'manufacturer'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [dateFilterBy, setDateFilterBy] = useState<'createdAt' | 'updatedAt' | 'deploymentPeriod'>('updatedAt');
  const [dateSince, setDateSince] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'since' | 'until'>('since');
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EntrySheet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const canDeleteSheet = (sheet: EntrySheet): boolean => canModifySheet(sheet);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      setExpandedSheets((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setSelectedSheets((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
    } catch {
      // App layer already surfaces the error.
    } finally {
      setIsDeleting(false);
    }
  };

  const formatYearMonth = (year: number, month: number): string => `${year}/${month}`;
  const computeAutoEndMonth = (startMonth: number | undefined): number | undefined => {
    if (!startMonth) return undefined;
    return ((startMonth + 1) % 12) + 1;
  };
  const getDeploymentPeriod = (sheet: EntrySheet): { start: string; end: string } => {
    if (!sheet.deploymentStartMonth) return { start: '', end: '' };
    const createdAt = new Date(sheet.createdAt);
    if (Number.isNaN(createdAt.getTime())) return { start: '', end: '' };
    const createdMonth = createdAt.getMonth() + 1;
    const monthOffset = (sheet.deploymentStartMonth - createdMonth + 12) % 12;
    const startDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
    startDate.setMonth(startDate.getMonth() + monthOffset);
    const resolvedEndMonth = sheet.deploymentEndMonth ?? computeAutoEndMonth(sheet.deploymentStartMonth);
    if (!resolvedEndMonth) return { start: '', end: '' };
    const endYear = resolvedEndMonth < sheet.deploymentStartMonth ? startDate.getFullYear() + 1 : startDate.getFullYear();
    const endDate = new Date(endYear, resolvedEndMonth - 1, 1);
    return {
      start: formatYearMonth(startDate.getFullYear(), startDate.getMonth() + 1),
      end: formatYearMonth(endDate.getFullYear(), endDate.getMonth() + 1),
    };
  };
  const getSheetDeploymentPeriodTimestamp = (sheet: EntrySheet): number | null => {
    if (!sheet.deploymentStartMonth) return null;
    const createdAt = new Date(sheet.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    const createdMonth = createdAt.getMonth() + 1;
    const monthOffset = (sheet.deploymentStartMonth - createdMonth + 12) % 12;
    const startDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
    startDate.setMonth(startDate.getMonth() + monthOffset);
    return startDate.getTime();
  };
  const getSheetDeploymentPeriodRange = (
    sheet: EntrySheet
  ): { startTs: number; endTs: number } | null => {
    if (!sheet.deploymentStartMonth) return null;
    const createdAt = new Date(sheet.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    const createdMonth = createdAt.getMonth() + 1;
    const monthOffset = (sheet.deploymentStartMonth - createdMonth + 12) % 12;
    const startDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
    startDate.setMonth(startDate.getMonth() + monthOffset);
    const resolvedEndMonth = sheet.deploymentEndMonth ?? computeAutoEndMonth(sheet.deploymentStartMonth);
    if (!resolvedEndMonth) return null;
    const endYear = resolvedEndMonth < sheet.deploymentStartMonth ? startDate.getFullYear() + 1 : startDate.getFullYear();
    const endDate = new Date(endYear, resolvedEndMonth, 0, 23, 59, 59, 999);
    return { startTs: startDate.getTime(), endTs: endDate.getTime() };
  };
  const getDeploymentPeriodLabel = (sheet: EntrySheet): string => {
    const period = getDeploymentPeriod(sheet);
    if (!period.start || !period.end) return '未設定';
    return `${period.start}~${period.end}`;
  };
  const getSheetShelfNames = (sheet: EntrySheet): string => sheet.shelfName?.trim() || '未設定';

  const getSheetTimestampBy = (
    sheet: EntrySheet,
    field: 'createdAt' | 'updatedAt' | 'deploymentPeriod'
  ): number | null => {
    if (field === 'createdAt') {
      return new Date(sheet.createdAt).getTime();
    }
    if (field === 'updatedAt') {
      return new Date(sheet.updatedAt).getTime();
    }
    return getSheetDeploymentPeriodTimestamp(sheet);
  };

  const toggleSort = (nextSortBy: 'updatedAt' | 'manufacturer') => {
    if (sortBy === nextSortBy) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortBy(nextSortBy);
    setSortOrder('asc');
  };

  const renderSortIcon = (key: 'updatedAt' | 'manufacturer') => {
    if (sortBy !== key) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={14} className="text-primary" />
    ) : (
      <ArrowDown size={14} className="text-primary" />
    );
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
      if (dateFilterBy === 'deploymentPeriod') {
        const range = getSheetDeploymentPeriodRange(sheet);
        if (!range) return false;
        return filterStart <= range.endTs && filterEnd >= range.startTs;
      }
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
  const loadedCount = sheets.length;
  const safeTotalCount = totalCount > 0 ? totalCount : loadedCount;
  const remainingCount = Math.max(safeTotalCount - loadedCount, 0);
  const remainingPages = Math.ceil(remainingCount / 30);
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
        '作成者',
        '作成日',
        '更新日',
        '展開期間開始',
        '展開期間終了',
        'シート添付ファイル名一覧',
        'シート添付ファイルURL一覧',
        '棚割名',
        '商品メーカー名',
        'JANコード',
        '商品名',
        '商品画像URL',
        'リスク分類',
        '特定成分',
        'キャッチコピー',
        '補足事項',
        '商品添付ファイル名一覧',
        '商品添付ファイルURL一覧',
        '幅(mm)',
        '高さ(mm)',
        '奥行(mm)',
        'フェイシング数',
        '送込み店舗着日要望',
        '販促物有無',
        '香り・色見本',
        '特殊な陳列什器',
        '販促物サイズ(幅)',
        '販促物サイズ(高さ)',
        '販促物サイズ(奥行)',
        '販促物画像URL',
      ]
    ];

    targetSheets.forEach(sheet => {
      const deploymentPeriod = getDeploymentPeriod(sheet);
      const sheetAttachmentNames = (sheet.attachments || []).map((file) => file.name).join(' / ');
      const sheetAttachmentUrls = (sheet.attachments || []).map((file) => file.url).join(' / ');
      sheet.products.forEach(prod => {
        const productAttachmentNames = (prod.productAttachments || []).map((file) => file.name).join(' / ');
        const productAttachmentUrls = (prod.productAttachments || []).map((file) => file.url).join(' / ');
        csvRows.push([
          toSafeCsvCell(getDisplaySheetId(sheet)),
          toSafeCsvCell(getWorkflowStatusView(sheet).label),
          toSafeCsvCell(sheet.title),
          toSafeCsvCell(sheet.notes || ''),
          toSafeCsvCell(sheet.manufacturerName),
          toSafeCsvCell(sheet.creatorName),
          toSafeCsvCell(new Date(sheet.createdAt).toLocaleDateString()),
          toSafeCsvCell(new Date(sheet.updatedAt).toLocaleDateString()),
          toSafeCsvCell(deploymentPeriod.start),
          toSafeCsvCell(deploymentPeriod.end),
          toSafeCsvCell(sheetAttachmentNames),
          toSafeCsvCell(sheetAttachmentUrls),
          toSafeCsvCell(sheet.shelfName || ''),
          toSafeCsvCell(prod.manufacturerName),
          toSafeCsvCell(prod.janCode),
          toSafeCsvCell(prod.productName),
          toSafeCsvCell(prod.productImage || ''),
          toSafeCsvCell(prod.riskClassification),
          toSafeCsvCell((prod.specificIngredients || []).join(' / ')),
          toSafeCsvCell(prod.catchCopy || ''),
          toSafeCsvCell(prod.productNotes || ''),
          toSafeCsvCell(productAttachmentNames),
          toSafeCsvCell(productAttachmentUrls),
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
          toSafeCsvCell(prod.promoImage || ''),
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
                            <div className="text-xs text-primary font-bold mb-0.5">{sheet.shelfName || '未設定'}</div>
                            {status.icon && <div title={status.statusText}>{status.icon}</div>}
                        </div>
                        <div className="text-sm font-bold text-slate-800 truncate" title={prod.productName}>{prod.productName || '(名称未設定)'}</div>
                        <div className="text-xs text-slate-500 font-mono mt-1">
                            送込み店舗着日要望: {prod.arrivalDate ? new Date(prod.arrivalDate).toLocaleDateString() : '未設定'}
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
            <h2 className={pageTitleClass}>エントリーシート履歴</h2>
            <p className={pageSubtitleClass}>
              {selectedSheets.size > 0 
                ? `${selectedSheets.size}件 選択中` 
                : "過去に作成したPOP情報の確認・編集ができます"}
            </p>
        </div>
        <div className="w-full sm:w-auto flex flex-row gap-3">
            <button
              onClick={() => setShowExportModal(true)}
              className={`flex-1 sm:flex-none ${toolbarAccentButtonClass}`}
            >
              <Download size={20} />
              CSV出力
            </button>
            <button
              onClick={downloadSelectedProductImages}
              disabled={isDownloadingImages}
              className={`flex-1 sm:flex-none justify-center px-4 py-3 rounded-lg flex items-center gap-2 font-bold shadow-sm transition-all
                ${isDownloadingImages ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : toolbarTertiaryButtonClass}
              `}
            >
              <ImageIcon size={20} />
              {isDownloadingImages ? '画像準備中...' : '商品画像一括DL'}
            </button>
            <button
              onClick={onCreate}
              className={`flex-1 sm:flex-none ${toolbarPrimaryButtonClass}`}
            >
              <Plus size={20} />
              新規作成
            </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className={searchInputClass}
            placeholder="シート名、メーカー名、商品名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 shrink-0">絞り込み</span>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 flex-1">
            <select
              value={dateFilterBy}
              onChange={(e) => setDateFilterBy(e.target.value as 'createdAt' | 'updatedAt' | 'deploymentPeriod')}
              className={filterControlClass}
            >
              <option value="createdAt">作成日</option>
              <option value="updatedAt">更新日</option>
              <option value="deploymentPeriod">展開期間</option>
            </select>
            <select
              value={dateFilterMode}
              onChange={(e) => setDateFilterMode(e.target.value as 'since' | 'until')}
              className={filterControlClass}
            >
              <option value="since">以降</option>
              <option value="until">以前</option>
            </select>
            <input
              type="date"
              value={dateSince}
              onChange={(e) => setDateSince(e.target.value)}
              className={`${filterControlClass} col-span-2 sm:col-span-1`}
            />
            {dateSince && (
              <button
                onClick={() => setDateSince('')}
                className="px-2 py-2 sm:py-1.5 rounded-md border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 col-span-2 sm:col-span-1 sm:w-auto"
              >
                解除
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <>
          {/* MOBILE SKELETON */}
          <div className="md:hidden space-y-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          {/* DESKTOP SKELETON */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="min-w-full table-fixed border-separate border-spacing-0">
              <thead className="bg-slate-50">
                <tr>
                  <th className="sticky left-0 top-0 z-50 w-12 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-24 border-b border-slate-200 px-2 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-20 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-[440px] border-b border-slate-200 px-6 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-28 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-32 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-36 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-24 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-32 border-b border-slate-200 px-4 py-3 bg-slate-50"></th>
                  <th className="sticky top-0 z-10 w-10 border-b border-slate-200 bg-slate-50"></th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        </>
      ) : filteredSheets.length === 0 ? (
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
          <div className="md:hidden space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
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
                const workflowStatus = getWorkflowStatusView(sheet);
                const assigneeLabel = getCurrentAssigneeLabel(sheet.currentAssignee);

                return (
                    <div key={sheet.id} className={`bg-white rounded-xl border ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-slate-200'} shadow-sm overflow-hidden`}>
                        {/* Card Header */}
                        <div className="p-4 flex gap-3">
                            <div className="pt-1" onClick={(e) => toggleSelect(sheet.id, e)}>
                                {isSelected ? <CheckSquare size={24} className="text-primary" /> : <Square size={24} className="text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0" onClick={() => toggleExpand(sheet.id)}>
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${workflowStatus.pillClassName}`}>
                                        {workflowStatus.label}
                                    </span>
                                    <span className="text-xs text-slate-400">{new Date(sheet.updatedAt).toLocaleDateString()}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mb-1">ID: {getDisplaySheetId(sheet)}</div>
                                <h3 className="text-base font-bold text-slate-900 leading-tight mb-1">{sheet.title}</h3>
                                <div className="text-xs text-slate-500 truncate">
                                    {sheet.manufacturerName} / {sheet.creatorName}
                                </div>
                                <div className="text-xs text-slate-600 mt-1">
                                    展開期間: {getDeploymentPeriodLabel(sheet)}
                                </div>
                                <div className="text-xs text-slate-600 mt-0.5 break-words">
                                    棚割り: {getSheetShelfNames(sheet)}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    担当: {assigneeLabel}
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
                                    onClick={() => setDeleteTarget(sheet)}
                                    disabled={!canDeleteSheet(sheet)}
                                    className={`p-2 rounded-full border border-transparent shadow-sm ${canDeleteSheet(sheet) ? 'text-slate-400 hover:text-danger hover:bg-white hover:border-slate-200' : 'text-slate-300 cursor-not-allowed'}`}
                                    title={canDeleteSheet(sheet) ? "削除" : "削除権限がありません"}
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
            <div className="overflow-auto max-h-[calc(100vh-260px)]">
              <table className="min-w-full table-fixed border-separate border-spacing-0">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-50 w-12 border-b border-slate-200 px-4 py-3 text-center bg-slate-50 shadow-[1px_0_0_0_rgba(226,232,240,1)]"
                    >
                      <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                        {selectedSheets.size === filteredSheets.length && filteredSheets.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                      </button>
                    </th>
                    <th
                      scope="col"
                      className="sticky top-0 z-10 w-24 border-b border-slate-200 px-2 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50"
                    >
                      ID
                    </th>
                    <th scope="col" className="sticky top-0 z-10 w-20 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">状態</th>
                    <th scope="col" className="sticky top-0 z-10 w-[440px] border-b border-slate-200 bg-slate-50 px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">タイトル</th>
                    <th scope="col" className="sticky top-0 z-10 w-28 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">展開期間</th>
                    <th scope="col" className="sticky top-0 z-10 w-32 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">棚割り</th>
                    <th scope="col" className={`sticky top-0 z-10 w-36 border-b border-slate-200 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider ${sortBy === 'manufacturer' ? 'text-primary bg-sky-50' : 'text-slate-500 bg-slate-50'}`}>
                      <button
                        onClick={() => toggleSort('manufacturer')}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        title="メーカー / 更新者の並び順を切り替え"
                      >
                        <span>メーカー / 更新者</span>
                        {renderSortIcon('manufacturer')}
                      </button>
                    </th>
                    <th scope="col" className={`sticky top-0 z-10 w-24 border-b border-slate-200 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider ${sortBy === 'updatedAt' ? 'text-primary bg-sky-50' : 'text-slate-500 bg-slate-50'}`}>
                      <button
                        onClick={() => toggleSort('updatedAt')}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        title="更新日の並び順を切り替え"
                      >
                        <span>更新日</span>
                        {renderSortIcon('updatedAt')}
                      </button>
                    </th>
                    <th scope="col" className="sticky top-0 z-10 w-32 border-b border-slate-200 bg-slate-50 px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">操作</th>
                    <th scope="col" className="sticky top-0 z-10 w-10 border-b border-slate-200 bg-slate-50"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredSheets.map((sheet) => {
                     const isExpanded = expandedSheets.has(sheet.id);
                     const isSelected = selectedSheets.has(sheet.id);
                     const workflowStatus = getWorkflowStatusView(sheet);
                     const assigneeLabel = getCurrentAssigneeLabel(sheet.currentAssignee);

                     return (
                      <React.Fragment key={sheet.id}>
                        <tr
                          className={`group transition-colors cursor-pointer ${isSelected ? 'bg-sky-50 hover:bg-sky-100' : isExpanded ? 'bg-slate-50 hover:bg-slate-100' : 'hover:bg-slate-50'}`}
                          onClick={() => toggleExpand(sheet.id)}
                        >
                          <td
                            className={`sticky left-0 z-30 w-12 px-4 py-4 text-center shadow-[1px_0_0_0_rgba(241,245,249,1)] ${isSelected ? 'bg-sky-50 group-hover:bg-sky-100' : isExpanded ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'}`}
                            onClick={(e) => toggleSelect(sheet.id, e)}
                          >
                             <div className="text-primary cursor-pointer inline-block">
                               {isSelected ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300" />}
                             </div>
                          </td>
                          <td className={`w-24 px-2 py-4 text-[10px] text-slate-400 font-mono whitespace-nowrap ${isSelected ? 'bg-sky-50 group-hover:bg-sky-100' : isExpanded ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'}`}>
                            {getDisplaySheetId(sheet)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${workflowStatus.pillClassName}`}>
                                {workflowStatus.label}
                              </span>
                              <div className="text-[11px] text-slate-500">担当: {assigneeLabel}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-900 line-clamp-2 break-words leading-tight">{sheet.title}</div>
                            <div className="text-xs text-slate-500">{sheet.products.length} 商品登録済</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-700">
                            {getDeploymentPeriodLabel(sheet)}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-700">
                            <div className="line-clamp-2 break-words" title={getSheetShelfNames(sheet)}>
                              {getSheetShelfNames(sheet)}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-xs text-slate-900 line-clamp-1">{sheet.manufacturerName}</div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">{sheet.creatorName}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500">
                            {new Date(sheet.updatedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={e => e.stopPropagation()}>
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
                                  onClick={() => setDeleteTarget(sheet)}
                                  disabled={!canDeleteSheet(sheet)}
                                  className={`p-2 rounded ${canDeleteSheet(sheet) ? 'text-slate-400 hover:text-danger hover:bg-red-50' : 'text-slate-300 cursor-not-allowed'}`}
                                  title={canDeleteSheet(sheet) ? "削除" : "削除権限がありません"}
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
                              <td colSpan={10} className="px-4 sm:px-6 py-4">
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

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-slate-500">
            表示: {loadedCount} / 全{safeTotalCount}件
            {remainingCount > 0 ? `（残り ${remainingCount}件 / 約${remainingPages}ページ）` : ''}
          </div>
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
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-rose-100 p-2 text-rose-600">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">エントリーシートを削除しますか？</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    この操作は取り消せません。関連する履歴、添付、クリエイティブ紐づけも削除されます。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed"
                aria-label="閉じる"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <dl className="space-y-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">ID</dt>
                  <dd className="text-right font-mono text-slate-700">{getDisplaySheetId(deleteTarget)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">状態</dt>
                  <dd className="text-right text-slate-700">{getWorkflowStatusView(deleteTarget).label}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">メーカー</dt>
                  <dd className="text-right text-slate-700">{deleteTarget.manufacturerName}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-slate-500">タイトル</dt>
                  <dd className="max-w-[70%] text-right text-slate-700">{deleteTarget.title || '（タイトル未設定）'}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDelete();
                }}
                disabled={isDeleting}
                className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
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
