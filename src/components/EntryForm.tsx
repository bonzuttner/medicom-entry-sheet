import React, { useRef, useState, useEffect } from 'react';
import { EntrySheet, EntrySheetRevision, FaceOption, MasterData, ProductEntry, Promotion, User, UserRole } from '../types';
import { Save, Plus, Trash2, AlertTriangle, Image as ImageIcon, Search, ChevronRight, FileText, PlusCircle, RefreshCw, Package, CheckCircle, RotateCcw, Edit3, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { dataService } from '../services/dataService';
import { getWorkflowStatusView } from '../lib/sheetWorkflow';

// Helper to determine revision icon based on summary text
const getRevisionIcon = (summary: string): { icon: React.ReactNode; color: string } => {
  const s = summary.toLowerCase();

  // Status/workflow changes
  if (s.includes('ステータス') || s.includes('状態') || s.includes('→')) {
    return { icon: <RefreshCw size={14} />, color: 'text-amber-500 bg-amber-50' };
  }
  // Approval/confirmation
  if (s.includes('承認') || s.includes('確定') || s.includes('完了')) {
    return { icon: <CheckCircle size={14} />, color: 'text-emerald-500 bg-emerald-50' };
  }
  // Return/reject
  if (s.includes('差戻') || s.includes('却下') || s.includes('返却')) {
    return { icon: <RotateCcw size={14} />, color: 'text-rose-500 bg-rose-50' };
  }
  // Product changes
  if (s.includes('商品') || s.includes('product')) {
    return { icon: <Package size={14} />, color: 'text-violet-500 bg-violet-50' };
  }
  // New creation
  if (s.includes('作成') || s.includes('新規') || s.includes('追加')) {
    return { icon: <PlusCircle size={14} />, color: 'text-sky-500 bg-sky-50' };
  }
  // Edit/update
  if (s.includes('編集') || s.includes('更新') || s.includes('変更')) {
    return { icon: <Edit3 size={14} />, color: 'text-blue-500 bg-blue-50' };
  }
  // Default
  return { icon: <FileText size={14} />, color: 'text-slate-400 bg-slate-100' };
};

interface EntryFormProps {
  initialData: EntrySheet;
  initialActiveTab?: number;
  masterData: MasterData;
  users: User[];
  reusableProductTemplates: Record<string, ProductEntry>;
  revisions: EntrySheetRevision[];
  currentUser: User;
  onSearchProducts: (query: string, manufacturerName: string) => Promise<ProductEntry[]>;
  onSave: (sheet: EntrySheet) => Promise<void> | void;
  onCancel: () => void;
}

const normalizeProductName = (value: string): string => value.trim().toLowerCase();
const AUTO_TITLE_BRAND_PLACEHOLDER = '"ブランド名を記入"';
const AUTO_TITLE_PATTERN =
  /^\d{4}(?:\/|年)\d{1,2}(?:月)?\s+.+\s+"ブランド名を記入"$/;
const LARGE_IMAGE_UPLOAD_ERROR =
  '画像サイズが大きすぎてアップロードできません。25MB以下の画像を使用してください。BMPは通信量が大きくなりやすいため、JPEG/PNGに変換するか画像サイズを下げて再試行してください。それでもできない場合は、担当者へメールで画像を送信ください。';
const normalizeSearchText = (value: string): string => value.normalize('NFKC').trim().toLowerCase();

export const EntryForm: React.FC<EntryFormProps> = ({
  initialData,
  initialActiveTab = 0,
  masterData,
  users,
  reusableProductTemplates,
  revisions,
  currentUser,
  onSearchProducts,
  onSave,
  onCancel,
}) => {
  const sectionTitleClass = 'text-base font-bold text-slate-800';
  const pageBlockTitleClass = 'text-lg font-bold text-slate-800';
  const helpTextClass = 'mt-1 text-xs text-slate-500';
  const [formData, setFormData] = useState<EntrySheet>(initialData);
  const [activeTab, setActiveTab] = useState<number>(initialActiveTab); // Index of the product being edited
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<ProductEntry[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [activePromotionTab, setActivePromotionTab] = useState<number>(0);
  const askedPrefillByProductRef = useRef<Map<number, string>>(new Map());
  const lastAutoTitleRef = useRef('');
  const isAdminUser = currentUser.role === UserRole.ADMIN;

  const selectableStartMonths = (() => {
    const base = new Date(formData.createdAt || new Date().toISOString());
    const items: Array<{ year: number; month: number; label: string }> = [];
    for (let i = 0; i < 4; i += 1) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      items.push({
        year,
        month,
        label: `${month}月`,
      });
    }
    return items;
  })();

  const selectedStartMonth = selectableStartMonths.find(
    (item) => item.month === formData.deploymentStartMonth
  );
  const buildAutoTitle = (
    startMonth: { year: number; month: number; label: string } | undefined,
    caseName?: string
  ): string => {
    const parts = [
      startMonth ? `${startMonth.year}年${startMonth.month}月` : 'YYYY年MM月',
    ];
    if (caseName?.trim()) {
      parts.push(caseName.trim());
    }
    parts.push(AUTO_TITLE_BRAND_PLACEHOLDER);
    return parts.join(' ');
  };
  const computeAutoEndMonth = (startMonth: number | undefined): number | undefined => {
    if (!startMonth) return undefined;
    return ((startMonth + 1) % 12) + 1;
  };
  const formatYearMonth = (year: number, month: number): string => `${year}/${month}`;
  const period = (() => {
    if (!selectedStartMonth) return { start: '', end: '' };
    const start = formatYearMonth(selectedStartMonth.year, selectedStartMonth.month);
    const resolvedEndMonth = formData.deploymentEndMonth ?? computeAutoEndMonth(formData.deploymentStartMonth);
    if (!resolvedEndMonth) return { start, end: '' };
    const endYear = resolvedEndMonth < selectedStartMonth.month ? selectedStartMonth.year + 1 : selectedStartMonth.year;
    const end = formatYearMonth(endYear, resolvedEndMonth);
    return { start, end };
  })();
  const getEndMonthLabel = (month: number): string => {
    if (!selectedStartMonth) return `-/${month}`;
    const endYear = month < selectedStartMonth.month ? selectedStartMonth.year + 1 : selectedStartMonth.year;
    return formatYearMonth(endYear, month);
  };

  const parseRequiredNumber = (value: string): number => {
    const parsed = Number(value.normalize('NFKC'));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    const normalized = value.normalize('NFKC').trim();
    if (normalized === '') return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const normalizeDigitsInput = (value: string): string =>
    value.normalize('NFKC').replace(/[^0-9]/g, '');

  const normalizePromoCodeInput = (value: string): string =>
    value.normalize('NFKC').toUpperCase();

  const normalizeJanCodeInput = (value: string): string =>
    normalizeDigitsInput(value);
  const hasText = (value: unknown): boolean =>
    typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
  const getFieldClass = (highlight = false): string =>
    `w-full rounded-lg border-0 p-3 shadow-none outline-none transition-colors ${
      highlight ? 'bg-amber-100/70 text-slate-900' : 'bg-slate-100 text-slate-800'
    } focus:bg-white focus:ring-2 focus:ring-sky-200`;
  const getTextareaClass = (highlight = false): string =>
    `w-full rounded-lg border-0 px-3 py-3 shadow-none outline-none transition-colors ${
      highlight ? 'bg-amber-100/70 text-slate-900' : 'bg-slate-100 text-slate-800'
    } focus:bg-white focus:ring-2 focus:ring-sky-200`;
  const getSelectClass = (highlight = false): string =>
    `w-full rounded-lg border-0 py-3 pl-3 pr-12 shadow-none outline-none transition-colors appearance-none select-with-arrow ${
      highlight ? 'bg-amber-100/70 text-slate-900' : 'bg-slate-100 text-slate-800'
    } focus:bg-white focus:ring-2 focus:ring-sky-200`;
  const compactSelectWrapperClass = 'w-full md:max-w-[420px]';
  const compactSelectClass = (highlight = false): string =>
    `${getSelectClass(highlight)} ring-1 ring-inset ${highlight ? 'ring-amber-200' : 'ring-slate-200'}`;
  const getShelfOptions = (): string[] => {
    return (
      masterData.manufacturerShelfNames?.[formData.manufacturerName] ||
      masterData.shelfNames ||
      []
    );
  };

  const getCaseOptions = (): string[] => {
    return (
      masterData.manufacturerCaseNames?.[formData.manufacturerName] ||
      masterData.caseNames ||
      []
    );
  };

  const getFaceOptions = (): FaceOption[] =>
    masterData.manufacturerFaceOptions?.[formData.manufacturerName] || [];

  const runProductSearch = async () => {
    setIsSearchingProducts(true);
    try {
      const rows = await onSearchProducts(productSearchQuery, formData.manufacturerName);
      const sorted = [...rows].sort((a, b) => a.productName.localeCompare(b.productName, 'ja'));
      setProductSearchResults(sorted);
    } catch (error) {
      console.error('Failed to search products:', error);
      alert('過去商品検索に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsSearchingProducts(false);
    }
  };

  const renderAutoValue = (value: string | number | undefined) => (
    <div>
      <div className="w-full border border-slate-200 rounded-lg p-3 bg-slate-100 text-slate-700">
        {value === undefined || value === '' ? '（未入力）' : String(value)}
      </div>
      <p className="text-xs text-slate-500 mt-1">※ 自動入力（編集不可）</p>
    </div>
  );
  const renderAutoValueWithUnit = (
    value: string | number | undefined,
    unit: string
  ) => (
    <div>
      <div className="w-full border border-slate-200 rounded-lg p-3 bg-slate-100 text-slate-700">
        {value === undefined || value === '' ? '（未入力）' : `${String(value)} ${unit}`}
      </div>
      <p className="text-xs text-slate-500 mt-1">※ 自動入力（編集不可）</p>
    </div>
  );

  // Sync update time
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      updatedAt: new Date().toISOString()
    }));
  }, [formData.products, formData.title, formData.email, formData.phoneNumber]);

  useEffect(() => {
    if (formData.deploymentStartMonth) return;
    const defaults =
      masterData.manufacturerDefaultStartMonths?.[formData.manufacturerName] || [];
    if (defaults.length === 0) return;
    const matched = selectableStartMonths.find((item) => defaults.includes(item.month));
    if (!matched) return;
    setFormData((prev) =>
      prev.deploymentStartMonth
        ? prev
        : {
            ...prev,
            deploymentStartMonth: matched.month,
            deploymentEndMonth: computeAutoEndMonth(matched.month),
          }
    );
  }, [
    formData.deploymentStartMonth,
    formData.manufacturerName,
    masterData.manufacturerDefaultStartMonths,
    selectableStartMonths,
  ]);

  useEffect(() => {
    const nextAutoTitle = buildAutoTitle(selectedStartMonth, formData.caseName);
    if (!nextAutoTitle) return;

    setFormData((prev) => {
      const currentTitle = prev.title.trim();
      const shouldApplyAutoTitle =
        currentTitle === '' ||
        currentTitle === lastAutoTitleRef.current ||
        AUTO_TITLE_PATTERN.test(currentTitle);

      if (!shouldApplyAutoTitle || currentTitle === nextAutoTitle) {
        lastAutoTitleRef.current = nextAutoTitle;
        return prev;
      }

      lastAutoTitleRef.current = nextAutoTitle;
      return {
        ...prev,
        title: nextAutoTitle,
      };
    });
  }, [formData.caseName, selectedStartMonth]);

  useEffect(() => {
    const faceOptions = getFaceOptions();
    if (faceOptions.length !== 1) return;
    const [onlyOption] = faceOptions;
    setFormData((prev) =>
      prev.faceLabel || prev.faceMaxWidth
        ? prev
        : {
            ...prev,
            faceLabel: onlyOption.label,
            faceMaxWidth: onlyOption.maxWidth,
          }
    );
  }, [formData.manufacturerName, masterData.manufacturerFaceOptions]);

  const handleHeaderChange = (field: keyof EntrySheet, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAdminMemoChange = (field: string, value: string | number | undefined) => {
    setFormData((prev) => ({
      ...prev,
      adminMemo: {
        ...(prev.adminMemo || {}),
        [field]: value,
      },
    }));
  };

  const normalizeUploadErrorMessage = (message: string): string => {
    const normalized = message.trim();
    if (!normalized) return 'アップロードに失敗しました。時間をおいて再試行してください。';
    const exactMap: Record<string, string> = {
      'Method not allowed': 'この操作は現在利用できません。画面を再読み込みして再試行してください。',
      'dataUrl and fileName are required':
        'アップロード情報が不足しています。ファイルを選択し直して再試行してください。',
      'Blob storage is not configured':
        '画像保存先の設定が未完了です。管理者に連絡してください。',
      'Invalid data URL': '画像データが不正です。別のファイルで再試行してください。',
      'Only allowed Blob URLs are accepted':
        '添付URLの形式が不正です。画面から再アップロードしたファイルを使用してください。',
      'Attachment URL is required':
        '添付URLが不足しています。ファイルを再アップロードしてください。',
      'Upload response does not include URL':
        'アップロード結果にURLが含まれていません。時間をおいて再試行してください。',
      'failed to read file': 'ファイルの読み込みに失敗しました。別のファイルで再試行してください。',
    };
    if (exactMap[normalized]) return exactMap[normalized];

    const unsupportedFileTypeMatch = normalized.match(/^Unsupported file type: (.+)$/);
    if (unsupportedFileTypeMatch) {
      return `ファイル形式「${unsupportedFileTypeMatch[1]}」は未対応です。AI/PNG/JPEG/EPS 形式を選択してください。`;
    }
    return normalized;
  };

  const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsDataURL(file);
  });

  const uploadFile = async (
    file: File,
    kind: 'image' | 'attachment' | 'promo'
  ): Promise<string> => {
    const dataUrl = await readFileAsDataUrl(file);
    let response: Response;
    try {
      response = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataUrl,
          fileName: file.name,
          kind,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Request can fail before reaching API when payload is too large.
      if (
        message.includes('Payload Too Large') ||
        message.includes('Request Entity Too Large') ||
        message.toLowerCase().includes('body') ||
        message.toLowerCase().includes('too large')
      ) {
        throw new Error(LARGE_IMAGE_UPLOAD_ERROR);
      }
      throw error;
    }

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error(LARGE_IMAGE_UPLOAD_ERROR);
      }
      const errorText = await response.text().catch(() => '');
      const trimmed = errorText.trim();
      if (!trimmed) {
        throw new Error('アップロードに失敗しました。時間をおいて再試行してください。');
      }
      let parsedMessage = '';
      try {
        const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          parsedMessage = parsed.error.trim();
        }
        if (!parsedMessage && typeof parsed.message === 'string' && parsed.message.trim()) {
          parsedMessage = parsed.message.trim();
        }
      } catch {
        // not JSON
      }
      const lowered = (parsedMessage || trimmed).toLowerCase();
      if (
        lowered.includes('payload too large') ||
        lowered.includes('request entity too large') ||
        lowered.includes('body exceeded') ||
        lowered.includes('body too large') ||
        lowered.includes('function payload')
      ) {
        throw new Error(LARGE_IMAGE_UPLOAD_ERROR);
      }
      throw new Error(normalizeUploadErrorMessage(parsedMessage || trimmed));
    }

    const payload = (await response.json()) as { url?: string };
    if (!payload.url) {
      throw new Error(normalizeUploadErrorMessage('Upload response does not include URL'));
    }
    return payload.url;
  };

  const runTrackedUpload = async <T,>(task: () => Promise<T>): Promise<T> => {
    setPendingUploads((current) => current + 1);
    try {
      return await task();
    } finally {
      setPendingUploads((current) => Math.max(0, current - 1));
    }
  };

  const handleAddAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const next = [...(formData.attachments ?? [])];
    const candidates = Array.from(files);
    const validFiles: File[] = [];
    for (const file of candidates) {
      if (file.size > MAX_FILE_BYTES) {
        alert(`ファイルサイズは25MB以下にしてください: ${file.name}`);
        continue;
      }
      validFiles.push(file);
    }

    const uploadResults = await runTrackedUpload(() =>
      Promise.allSettled(validFiles.map((file) => uploadFile(file, 'attachment')))
    );

    uploadResults.forEach((result, index) => {
      const file = validFiles[index];
      if (result.status === 'fulfilled') {
        next.push({
          name: file.name,
          size: file.size,
          type: file.type || '',
          url: result.value,
        });
        return;
      }
      alert(`ファイルの読み込みに失敗しました: ${file.name}`);
    });
    setFormData(prev => ({ ...prev, attachments: next }));
  };

  const handleRemoveAttachment = (index: number) => {
    const next = [...(formData.attachments ?? [])];
    next.splice(index, 1);
    setFormData(prev => ({ ...prev, attachments: next }));
  };

  const handleAddProductAttachments = async (productIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const current = formData.products[productIndex];
    const next = [...(current.productAttachments ?? [])];
    const candidates = Array.from(files);
    const validFiles: File[] = [];
    for (const file of candidates) {
      if (file.size > MAX_FILE_BYTES) {
        alert(`ファイルサイズは25MB以下にしてください: ${file.name}`);
        continue;
      }
      validFiles.push(file);
    }

    const uploadResults = await runTrackedUpload(() =>
      Promise.allSettled(validFiles.map((file) => uploadFile(file, 'attachment')))
    );

    uploadResults.forEach((result, index) => {
      const file = validFiles[index];
      if (result.status === 'fulfilled') {
        next.push({
          name: file.name,
          size: file.size,
          type: file.type || '',
          url: result.value,
        });
        return;
      }
      alert(`ファイルの読み込みに失敗しました: ${file.name}`);
    });
    handleProductChange(productIndex, 'productAttachments', next);
  };

  const handleRemoveProductAttachment = (productIndex: number, fileIndex: number) => {
    const current = formData.products[productIndex];
    const next = [...(current.productAttachments ?? [])];
    next.splice(fileIndex, 1);
    handleProductChange(productIndex, 'productAttachments', next);
  };

  const formatDate = (value?: string): string => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('ja-JP');
  };

  const formatBytes = (value: number): string => {
    if (!Number.isFinite(value)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  const getSafeDownloadUrl = (value?: string): string => {
    if (!value) return '#';
    if (value.startsWith('data:')) return value;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return value;
      }
    } catch {
      // noop
    }
    return '#';
  };

  const getDisplayFileNameFromUrl = (value?: string): string => {
    if (!value) return '';
    try {
      const parsed = new URL(value);
      const raw = decodeURIComponent(parsed.pathname.split('/').pop() || '');
      if (!raw) return '';
      const withoutTimestamp = raw.replace(/^\d+-/, '');
      const withoutRandomSuffix =
        withoutTimestamp.match(/^(.+\.[A-Za-z0-9]+)-[A-Za-z0-9]{6,}$/)?.[1] ||
        withoutTimestamp.replace(/-[A-Za-z0-9]{6,}$/, '');
      return withoutRandomSuffix;
    } catch {
      return '';
    }
  };

  const findReusableProductByName = (
    productName: string,
    currentIndex: number,
    products: ProductEntry[] = formData.products
  ): ProductEntry | undefined => {
    const normalized = normalizeProductName(productName);
    if (!normalized) return undefined;

    for (let i = products.length - 1; i >= 0; i -= 1) {
      if (i === currentIndex) continue;
      const product = products[i];
      if (normalizeProductName(product.productName || '') === normalized) {
        return product;
      }
    }

    return reusableProductTemplates[normalized];
  };

  const handleProductChange = (index: number, field: keyof ProductEntry, value: any) => {
    const newProducts = [...formData.products];
    newProducts[index] = { ...newProducts[index], [field]: value };
    setFormData(prev => ({ ...prev, products: newProducts }));
  };

  const toComparableProduct = (product: ProductEntry) => ({
    manufacturerName: product.manufacturerName,
    janCode: product.janCode,
    productName: normalizeProductName(product.productName || ''),
    productImage: product.productImage || '',
    riskClassification: product.riskClassification,
    specificIngredients: [...product.specificIngredients].sort(),
    catchCopy: product.catchCopy,
    productNotes: product.productNotes || '',
    width: product.width,
    height: product.height,
    depth: product.depth,
    facingCount: product.facingCount,
    arrivalDate: product.arrivalDate || '',
  });

  const applyReusableProduct = (index: number, candidate: ProductEntry) => {
    setFormData((prev) => {
      const newProducts = [...prev.products];
      const current = newProducts[index];

      newProducts[index] = {
        ...current,
        ...candidate,
        id: current.id,
        manufacturerName: current.manufacturerName,
        productName: current.productName,
        specificIngredients: [...candidate.specificIngredients],
      };

      return {
        ...prev,
        products: newProducts,
      };
    });
  };

  const applySearchedProduct = (index: number, candidate: ProductEntry) => {
    setFormData((prev) => {
      const nextProducts = [...prev.products];
      const current = nextProducts[index];
      nextProducts[index] = {
        ...current,
        ...candidate,
        id: current.id,
        manufacturerName: current.manufacturerName,
      };
      return { ...prev, products: nextProducts };
    });
  };

  const maybeSuggestReusableProduct = (index: number, productName: string) => {
    const normalized = normalizeProductName(productName);
    if (!normalized) return;

    const askedName = askedPrefillByProductRef.current.get(index);
    if (askedName === normalized) return;

    const candidate = findReusableProductByName(productName, index);
    if (!candidate) return;

    const current = formData.products[index];
    const hasDifference =
      JSON.stringify(toComparableProduct(current)) !== JSON.stringify(toComparableProduct(candidate));
    if (!hasDifference) return;

    askedPrefillByProductRef.current.set(index, normalized);
    const shouldApply = window.confirm(
      `同名商品「${productName}」の過去データが見つかりました。商品情報を反映しますか？`
    );
    if (!shouldApply) return;

    applyReusableProduct(index, candidate);
  };

  const handleProductNameChange = (index: number, productName: string) => {
    askedPrefillByProductRef.current.delete(index);
    setFormData((prev) => {
      const newProducts = [...prev.products];
      newProducts[index] = {
        ...newProducts[index],
        productName,
      };

      return { ...prev, products: newProducts };
    });
  };

  const handleSpecificIngredientsChange = (index: number, ingredient: string) => {
    const newProducts = [...formData.products];
    const currentList = newProducts[index].specificIngredients;
    if (currentList.includes(ingredient)) {
      newProducts[index].specificIngredients = currentList.filter(i => i !== ingredient);
    } else {
      newProducts[index].specificIngredients = [...currentList, ingredient];
    }
    setFormData(prev => ({ ...prev, products: newProducts }));
  };

  const addProduct = () => {
    const newProduct: ProductEntry = {
      id: uuidv4(),
      manufacturerName: formData.manufacturerName,
      janCode: '',
      productName: '',
      riskClassification: masterData.riskClassifications[0] || '',
      specificIngredients: [],
      catchCopy: '',
      productNotes: '',
      productAttachments: [],
      width: 0,
      height: 0,
      depth: 0,
      facingCount: 1,
    };
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, newProduct]
    }));
    setActiveTab(formData.products.length); // Switch to new product
  };

  const removeProduct = (index: number) => {
    if (formData.products.length === 1) {
        alert("少なくとも1つの商品を登録する必要があります。");
        return;
    }
    if (!window.confirm("この商品情報を削除しますか？")) return;
    
    const newProducts = formData.products.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, products: newProducts }));
    if (activeTab >= newProducts.length) setActiveTab(newProducts.length - 1);
  };

  // Promotion handlers
  const addPromotion = () => {
    const newPromotion: Promotion = {
      id: uuidv4(),
      hasPromoMaterial: 'yes',
      promoSample: '',
      specialFixture: '',
      promoWidth: undefined,
      promoHeight: undefined,
      promoDepth: undefined,
      promoImage: '',
    };
    setFormData(prev => ({
      ...prev,
      promotions: [...(prev.promotions || []), newPromotion]
    }));
    setActivePromotionTab((formData.promotions || []).length);
  };

  const removePromotion = (index: number) => {
    if (!window.confirm("この販促物情報を削除しますか？")) return;
    const newPromotions = (formData.promotions || []).filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, promotions: newPromotions }));
    if (activePromotionTab >= newPromotions.length) {
      setActivePromotionTab(Math.max(0, newPromotions.length - 1));
    }
  };

  const handlePromotionChange = (index: number, field: keyof Promotion, value: any) => {
    const newPromotions = [...(formData.promotions || [])];
    newPromotions[index] = { ...newPromotions[index], [field]: value };
    setFormData(prev => ({ ...prev, promotions: newPromotions }));
  };

  const handlePromotionImageUpload = (index: number) => {
    const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.ai,.eps';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_IMAGE_BYTES) {
        alert('画像サイズが大きすぎます。25MB以下の画像を使用してください。');
        return;
      }
      try {
        const url = await runTrackedUpload(() => uploadFile(file, 'promo'));
        handlePromotionChange(index, 'promoImage', url);
      } catch (error) {
        console.error('Promotion image upload failed:', error);
        const message = error instanceof Error ? error.message : '画像のアップロードに失敗しました。';
        alert(message);
      }
    };
    input.click();
  };

  const getPromotionTabState = (promo: Promotion) => {
    const hasImage = !!promo.promoImage;
    const hasDimensions = (promo.promoWidth ?? 0) > 0 && (promo.promoHeight ?? 0) > 0 && (promo.promoDepth ?? 0) > 0;
    if (hasImage && hasDimensions) {
      return { label: '完了', tone: 'bg-emerald-100 text-emerald-700' };
    }
    if (hasImage || hasDimensions || promo.promoSample || promo.specialFixture) {
      return { label: '入力中', tone: 'bg-amber-100 text-amber-700' };
    }
    return { label: '未入力', tone: 'bg-slate-100 text-slate-500' };
  };

  const saveSheet = async (status: 'draft' | 'completed') => {
    if (isSaving) return;
    if (pendingUploads > 0) {
        alert("ファイルアップロード中です。完了後に保存してください。");
        return;
    }
    // Basic validation
    if (!formData.creatorName) {
        alert("作成者を入力してください");
        return;
    }
    if (!formData.email) {
        alert("作成者メールを入力してください");
        return;
    }
    if (!formData.phoneNumber) {
        alert("作成者電話番号を入力してください");
        return;
    }
    if (!formData.title) {
        alert("タイトルを入力してください");
        return;
    }
    
    let finalStatus: EntrySheet['status'] = status;
    if (status === 'completed') {
        if (faceOptions.length > 0 && !selectedFaceMaxWidth) {
            alert("棚割り幅を選択してください");
            return;
        }
        if (selectedFaceMaxWidth && shelfWidthTotal > selectedFaceMaxWidth) {
            alert(`商品幅合計がフェイスMAX値（${selectedFaceMaxWidth}mm）を超えているため完了できません。`);
            return;
        }
        const hasMissingProductImage = formData.products.some((product) => !product.productImage);
        if (hasMissingProductImage) {
          finalStatus = 'completed_no_image';
        }
        // Strict validation
        for (const [index, p] of formData.products.entries()) {
            const missing: string[] = [];
            if (!p.productName) missing.push('商品名');
            if (!p.janCode) missing.push('JANコード');
            if (missing.length > 0) {
                alert(`商品${index + 1}の必須項目が不足しています: ${missing.join('、')}`);
                return;
            }
            if ((p.janCode.length !== 8 && p.janCode.length !== 13 && p.janCode.length !== 16)) { // 13 is standard JAN
                alert(`商品${index + 1}（${p.productName}）のJANコードは8桁 / 13桁 / 16桁で入力してください。`);
                return;
            }
            if (!/^\d+$/.test(p.janCode)) {
                alert(`商品${index + 1}（${p.productName}）のJANコードは半角数字のみ入力してください。`);
                return;
            }
        }
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        status: finalStatus,
        entryStatus: finalStatus,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for product image upload
  const handleImageUpload = (index: number) => {
    const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
    const MIN_SHORT_SIDE_PX = 1000;
    const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
      new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
          URL.revokeObjectURL(objectUrl);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('画像の解像度を判定できませんでした'));
        };
        image.src = objectUrl;
      });

    // Simulate file input click
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
                alert("画像容量は25MB以下にしてください。");
                return;
            }
            try {
              const { width, height } = await getImageDimensions(file);
              const shortSide = Math.min(width, height);
              if (shortSide < MIN_SHORT_SIDE_PX) {
                alert(`解像度不足です（短辺${MIN_SHORT_SIDE_PX}px未満）。`);
                return;
              }
              const url = await runTrackedUpload(() => uploadFile(file, 'image'));
              handleProductChange(index, 'productImage', url);
            } catch (error) {
              const message = error instanceof Error ? error.message : '';
              if (
                message.includes('Payload Too Large') ||
                message.includes('Request Entity Too Large') ||
                message.includes('画像サイズが大きすぎてアップロードできません')
              ) {
                alert(LARGE_IMAGE_UPLOAD_ERROR);
                return;
              }
              if (message.includes('解像度不足')) {
                alert(`商品画像の解像度が不足しています（${file.name}）。短辺1000px以上の画像を選択してください。`);
                return;
              }
              if (message.includes('画像の解像度を判定できない') || message.includes('Unsupported file type')) {
                alert(`商品画像の形式に問題があります（${file.name}）。JPEG/PNG/WebP/GIF/BMPを使用してください。`);
                return;
              }
              alert(`画像のアップロードに失敗しました（${file.name}）。時間をおいて再試行してください。`);
            }
        }
    };
    input.click();
  };

  const activeProduct = formData.products[activeTab];
  const faceOptions = getFaceOptions();
  const selectedFaceOption =
    faceOptions.find((option) => option.label === formData.faceLabel) ||
    (formData.faceLabel && formData.faceMaxWidth
      ? { label: formData.faceLabel, maxWidth: formData.faceMaxWidth }
      : undefined);
  const selectedFaceMaxWidth = selectedFaceOption?.maxWidth;
  const shelfWidthTotal = formData.products.reduce((sum, product) => {
    const width = Number(product.width) || 0;
    const facing = Number(product.facingCount) || 0;
    return sum + width * facing;
  }, 0);
  const isShelfWidthOver = selectedFaceMaxWidth ? shelfWidthTotal > selectedFaceMaxWidth : false;
  const workflowStatus = getWorkflowStatusView(formData);
  const currentEntryStatus = formData.entryStatus || formData.status;
  const getProductTabState = (product: ProductEntry): { label: string; tone: string } => {
    const coreChecks = [
      hasText(product.janCode),
      hasText(product.productName),
      hasText(product.productImage),
      Number(product.width) > 0,
      Number(product.height) > 0,
      Number(product.depth) > 0,
      Number(product.facingCount) > 0,
    ];
    const allFilled = coreChecks.every(Boolean);
    if (allFilled) {
      return { label: '完了', tone: 'bg-emerald-100 text-emerald-700' };
    }
    const anyFilled = coreChecks.some(Boolean);
    if (anyFilled) {
      return { label: '入力中', tone: 'bg-amber-100 text-amber-700' };
    }
    return { label: '未入力', tone: 'bg-slate-100 text-slate-600' };
  };
  return (
    <div className="pb-24 sm:pb-20">
      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        {/* メインアクションバー */}
        <div className="p-3 sm:p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* 左: ステータス */}
            <div className="hidden sm:flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${workflowStatus.pillClassName}`}>
                {workflowStatus.label}
              </span>
            </div>
            {/* モバイル: コンパクト表示 */}
            <div className="flex sm:hidden items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${workflowStatus.pillClassName}`}>
                {workflowStatus.label}
              </span>
            </div>
            {/* 右: アクションボタン */}
            <div className="flex gap-2 sm:gap-3">
              {/* draft: 一時保存 + エントリー完了 */}
              {currentEntryStatus === 'draft' && (
                <>
                  <button
                    onClick={() => { void saveSheet('draft'); }}
                    disabled={isSaving || pendingUploads > 0}
                    className="px-3 sm:px-4 py-2.5 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {pendingUploads > 0 ? 'アップロード中...' : isSaving ? '保存中...' : '一時保存'}
                  </button>
                  <button
                    onClick={() => { void saveSheet('completed'); }}
                    disabled={isSaving || pendingUploads > 0}
                    className="px-4 sm:px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-sky-600 shadow-lg shadow-sky-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                  >
                    <Save size={18} />
                    {pendingUploads > 0 ? 'アップロード中...' : isSaving ? '保存中...' : 'エントリー完了'}
                  </button>
                </>
              )}
              {/* completed: 編集保存 */}
              {currentEntryStatus !== 'draft' && (
                <button
                  onClick={() => { void saveSheet(currentEntryStatus); }}
                  disabled={isSaving || pendingUploads > 0}
                  className="px-4 sm:px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-sky-600 shadow-lg shadow-sky-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  <Save size={18} />
                  {pendingUploads > 0 ? 'アップロード中...' : isSaving ? '保存中...' : '保存'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sheet Info (Header) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="mb-4 flex items-center justify-between border-b pb-4">
          <h3 className={pageBlockTitleClass}>シート基本情報</h3>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${workflowStatus.pillClassName}`}>
            {workflowStatus.label}
          </span>
        </div>

        <div className="mb-6">
            <h4 className={`${sectionTitleClass} mb-4 flex items-center gap-2`}>
                <span className="w-1 h-5 bg-amber-500 rounded-full"></span>
                作成情報
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">更新日 (自動入力)</label>
                    <div className="p-3 bg-slate-100 rounded-lg text-slate-700">{formatDate(formData.updatedAt)}</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">作成日 (自動入力)</label>
                    <div className="p-3 bg-slate-100 rounded-lg text-slate-700">{formatDate(formData.createdAt)}</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">メーカー名 (自動入力)</label>
                    <div className="p-3 bg-slate-100 rounded-lg text-slate-700">{formData.manufacturerName}</div>
                </div>
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">作成者 <span className="text-danger font-bold">*</span></label>
                    <input 
                        type="text" 
                        value={formData.creatorName} 
                        onChange={(e) => handleHeaderChange('creatorName', e.target.value)}
                        className={getFieldClass(!hasText(formData.creatorName))} 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">作成者メール <span className="text-danger font-bold">*</span></label>
                    <input 
                        type="email" 
                        value={formData.email} 
                        onChange={(e) => handleHeaderChange('email', e.target.value)}
                        className={getFieldClass(!hasText(formData.email))} 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">作成者電話番号 <span className="text-danger font-bold">*</span></label>
                    <input 
                        type="tel" 
                        value={formData.phoneNumber} 
                        onChange={(e) => handleHeaderChange('phoneNumber', e.target.value)}
                        className={getFieldClass(!hasText(formData.phoneNumber))} 
                    />
                </div>
            </div>
        </div>

        <div>
            <h4 className={`${sectionTitleClass} mb-4 flex items-center gap-2`}>
                <span className="w-1 h-5 bg-sky-500 rounded-full"></span>
                詳細情報
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">棚割名 <span className="text-danger font-bold">*</span></label>
                    <div className={compactSelectWrapperClass}>
                      <select
                          className={compactSelectClass(!hasText(formData.shelfName))}
                          value={formData.shelfName || ''}
                          onChange={(e) => handleHeaderChange('shelfName', e.target.value)}
                      >
                          <option value="">選択してください</option>
                          {getShelfOptions().map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">タイトル <span className="text-danger font-bold">*</span></label>
                    <input 
                        type="text" 
                        value={formData.title} 
                        onChange={(e) => handleHeaderChange('title', e.target.value)}
                        className={`${getFieldClass(!hasText(formData.title))} text-base sm:text-lg`} 
                        placeholder="例：2024年秋の新商品プロモーション"
                    />
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">案件 <span className="text-danger font-bold">*</span></label>
                    <div className={compactSelectWrapperClass}>
                      <select
                          className={compactSelectClass(!hasText(formData.caseName))}
                          value={formData.caseName || ''}
                          onChange={(e) => handleHeaderChange('caseName', e.target.value)}
                      >
                          <option value="">未設定</option>
                          {getCaseOptions().map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                </div>
                <div className="col-span-1 md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">展開スタート月</label>
                        <div className="flex flex-wrap gap-2">
                          {selectableStartMonths.map((item) => {
                            const checked = formData.deploymentStartMonth === item.month;
                            return (
                              <button
                                key={`${item.year}-${item.month}`}
                                type="button"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    deploymentStartMonth: item.month,
                                    deploymentEndMonth:
                                      isAdminUser && prev.deploymentEndMonth
                                        ? prev.deploymentEndMonth
                                        : computeAutoEndMonth(item.month),
                                  }))
                                }
                                className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                                  checked
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">展開期間</label>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="min-w-[110px] rounded-lg bg-slate-100 px-4 py-3 text-center font-semibold text-slate-700">
                            {period.start || '-'}
                          </div>
                          <span className="text-slate-500">~</span>
                          {isAdminUser ? (
                            <select
                              value={formData.deploymentEndMonth ?? computeAutoEndMonth(formData.deploymentStartMonth) ?? ''}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  deploymentEndMonth: Number(e.target.value) || undefined,
                                }))
                              }
                              className={`${getSelectClass()} min-w-[140px] w-auto text-center font-semibold`}
                            >
                              {[...Array(12)].map((_, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                  {getEndMonthLabel(idx + 1)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="min-w-[140px] rounded-lg bg-slate-100 px-4 py-3 text-center font-semibold text-slate-700">
                              {period.end || '-'}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          {isAdminUser ? '※ 終了月は管理者のみ変更できます' : '※ 自動入力（終了月は管理者のみ変更可）'}
                        </p>
                      </div>
                    </div>
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">エントリシート補足情報</label>
                    <textarea
                        rows={3}
                        value={formData.notes || ''}
                        onChange={(e) => handleHeaderChange('notes', e.target.value)}
                        className={getTextareaClass()}
                        placeholder="エントリーシートのコンセプトをご記載ください"
                    />
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">添付ファイル</label>
                    <input
                        type="file"
                        multiple
                        className="block w-full text-transparent file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                        onChange={(e) => {
                          const input = e.target;
                          void handleAddAttachments(input.files).finally(() => {
                            input.value = '';
                          });
                        }}
                    />
                    <p className="text-xs text-slate-500 mt-1">※ 25MB以下</p>
                    {(formData.attachments ?? []).length > 0 && (
                        <ul className="mt-3 space-y-2">
                            {(formData.attachments ?? []).map((file, index) => (
                                <li key={`${file.name}-${index}`} className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-slate-700">
                                        {file.name} <span className="text-slate-400">({formatBytes(file.size)})</span>
                                    </span>
                                    <div className="flex items-center gap-4 text-sm">
                                        <a
                                            href={getSafeDownloadUrl(file.url || file.dataUrl)}
                                            download={file.name}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            ダウンロード
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAttachment(index)}
                                            className="font-medium text-danger hover:underline"
                                        >
                                            削除
                                        </button>
                                    </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="col-span-1 md:col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-start">
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">棚割り幅</label>
                          {faceOptions.length > 0 ? (
                            <select
                              value={formData.faceLabel || ''}
                              onChange={(e) => {
                                const nextOption = faceOptions.find((option) => option.label === e.target.value);
                                setFormData((prev) => ({
                                  ...prev,
                                  faceLabel: nextOption?.label || '',
                                  faceMaxWidth: nextOption?.maxWidth,
                                }));
                              }}
                              className={getSelectClass()}
                            >
                              <option value="">選択してください</option>
                              {faceOptions.map((option) => (
                                <option key={`${option.label}-${option.maxWidth}`} value={option.label}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="w-full rounded-lg bg-slate-100 p-3 text-slate-500">
                              マスタ未設定
                            </div>
                          )}
                          <p className="text-xs text-slate-500 mt-2">
                            選択した棚割り幅に紐づくMAX値で商品幅合計を判定します。
                          </p>
                      </div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">棚割り幅合計 (mm) ＊自動計算</label>
                          <div className={`rounded-lg p-3 ${isShelfWidthOver ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                              {shelfWidthTotal.toLocaleString('ja-JP')} mm
                          </div>
                          <p className={`mt-2 text-xs ${isShelfWidthOver ? 'text-red-600' : 'text-slate-500'}`}>
                          商品情報ごとの「個装サイズ(幅) × フェイシング数」の合計値。
                          {selectedFaceMaxWidth
                            ? ` 選択中のフェイスMAX値は ${selectedFaceMaxWidth}mm です。`
                            : ' 棚割り幅を選択すると判定上限を表示します。'}
                          </p>
                      </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="mt-8">
          <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-rose-500 rounded-full"></span>
            変更履歴（直近）
            <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-semibold">
              {revisions.length}件
            </span>
          </h4>
          {revisions.length === 0 ? (
            <p className="text-sm text-slate-500">履歴はまだありません。</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {revisions.map((revision) => {
                const { icon, color } = getRevisionIcon(revision.summary);
                return (
                  <li key={revision.id} className="px-3 py-2.5 hover:bg-slate-50">
                    <div className="flex items-start gap-2.5">
                      <div className={`flex-shrink-0 mt-0.5 p-1.5 rounded-full ${color}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
                          <span>{new Date(revision.changedAt).toLocaleString('ja-JP')}</span>
                          <span className="font-medium">{revision.changedByName || '不明ユーザー'}</span>
                        </div>
                        <div className="text-xs text-slate-700 whitespace-pre-wrap leading-5">
                          {revision.summary}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Products Tabs */}
      <div className="relative">
        <div className="flex items-center overflow-x-auto gap-2 mb-0 pb-2 no-scrollbar pr-8 sm:pr-0">
          <button
              onClick={addProduct}
              className="flex items-center gap-1 px-3 sm:px-4 py-2 text-sm text-primary font-bold hover:bg-sky-50 rounded-lg transition-colors flex-shrink-0"
          >
              <Plus size={16} /> <span className="hidden sm:inline">商品追加</span><span className="sm:hidden">追加</span>
          </button>
          {formData.products.map((prod, idx) => {
              const tabState = getProductTabState(prod);
              return (
              <button
                  key={prod.id}
                  onClick={() => setActiveTab(idx)}
                  className={`
                      px-3 sm:px-5 py-3 rounded-t-lg font-bold text-xs sm:text-sm whitespace-nowrap border-t border-l border-r flex-shrink-0 max-w-[120px] sm:max-w-none truncate
                      ${activeTab === idx
                          ? 'bg-white border-slate-200 text-primary z-10 relative -mb-[1px]'
                          : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}
                  `}
                  title={prod.productName || `商品 ${idx + 1}`}
              >
                  <span>{prod.productName || `商品 ${idx + 1}`}</span>
                  <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tabState.tone}`}>
                    {tabState.label}
                  </span>
              </button>
              );
          })}
        </div>
        {/* Scroll hint for mobile when there are multiple products */}
        {formData.products.length > 2 && (
          <div className="sm:hidden absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-slate-50 to-transparent flex items-center justify-end pointer-events-none">
            <ChevronRight size={16} className="text-slate-400 mr-1" />
          </div>
        )}
      </div>

      {/* Product Form Area */}
      <div className="bg-white rounded-xl rounded-tl-none shadow-sm border border-slate-200 p-4 sm:p-8 relative">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
            <button 
                onClick={() => removeProduct(activeTab)}
                className="text-slate-400 hover:text-danger p-2 border border-transparent hover:border-slate-200 rounded transition-colors"
                title="この商品を削除"
            >
                <Trash2 size={20} />
            </button>
        </div>

        <section className="mb-5 sm:mb-6 mt-4 sm:mt-0 pr-12 sm:pr-14">
          <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-slate-500 border border-slate-200">
                <Search size={11} />
              </span>
              <h4 className="text-xs sm:text-sm font-semibold text-slate-700 tracking-wide">過去商品検索</h4>
            </div>
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runProductSearch();
              }}
            >
              <input
                type="text"
                className="flex-1 border-slate-300 rounded-md py-2 px-2.5 bg-white text-sm"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                placeholder="商品名またはJANで検索"
              />
              <button
                type="submit"
                disabled={isSearchingProducts}
                className="px-3 py-2 rounded-md bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60 text-sm"
              >
                {isSearchingProducts ? '検索中...' : '検索'}
              </button>
            </form>
            {productSearchResults.length > 0 && (
              <ul className="mt-2.5 max-h-44 overflow-auto space-y-1.5">
                {productSearchResults.map((item) => (
                  <li
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-md"
                  >
                    <button
                      type="button"
                      onClick={() => applySearchedProduct(activeTab, item)}
                      className="w-full text-left px-2.5 py-2 transition-colors hover:bg-sky-50 focus:bg-sky-50 rounded-md group cursor-pointer"
                    >
                      <div className="text-xs sm:text-sm min-w-0">
                        <div className="font-medium text-slate-700 truncate underline-offset-2 group-hover:underline group-focus:underline">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          JAN: {item.janCode}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Product: Basic Info */}
        <section className="mb-8 sm:mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-primary rounded-full"></span>
                商品情報
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">JANコード <span className="text-danger font-bold">*</span> <span className="text-xs font-normal text-slate-500">(8, 13, 16桁)</span></label>
                     <input 
                        type="text" 
                        className={`${getFieldClass(!hasText(activeProduct.janCode))} font-mono`}
                        placeholder="1234567890123"
                        value={activeProduct.janCode}
                        onChange={(e) => handleProductChange(activeTab, 'janCode', normalizeJanCodeInput(e.target.value))}
                        maxLength={16}
                     />
                </div>
                 <div className="md:col-span-2">
                     <label className="block text-sm font-bold text-slate-700 mb-2">商品名 <span className="text-danger font-bold">*</span></label>
                     <input 
                        type="text" 
                        className={getFieldClass(!hasText(activeProduct.productName))}
                        placeholder="例：〇〇胃薬 A 30錠"
                        value={activeProduct.productName}
                        onChange={(e) => handleProductNameChange(activeTab, e.target.value)}
                        onBlur={(e) => maybeSuggestReusableProduct(activeTab, e.target.value)}
                     />
                </div>
                 {/* Product Image - Prominent */}
                 <div className="md:col-span-2 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 mb-2">
                    <label className="block text-base font-bold text-slate-700 mb-3">
                        商品画像 <span className="text-danger font-bold">*</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                        <div 
                            className={`
                                w-full sm:w-40 h-48 sm:h-40 flex-shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden relative
                                ${!activeProduct.productImage ? 'border-amber-200 bg-amber-100/70' : 'border-transparent bg-slate-100'}
                            `}
                            onClick={() => handleImageUpload(activeTab)}
                        >
                            {activeProduct.productImage ? (
                                <img src={activeProduct.productImage} alt="Product" className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-center p-2">
                                    <ImageIcon className="mx-auto text-warning mb-1" />
                                    <span className="text-xs text-slate-500 font-bold">画像登録なし</span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 text-sm text-slate-600">
                            <p className="mb-2"><strong>推奨:</strong> 300dpi相当 (2500px以上)。</p>
                            <p className="mb-3 text-slate-500">※A4で印刷可能な高解像度画像をアップロードしてください。保存できない場合は担当者へメール送付してください。</p>
                            <p className="mb-3 text-slate-500">※登録可能な形式: ai / PNG / jpeg / eps</p>
                            <button 
                                onClick={() => handleImageUpload(activeTab)}
                                className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 text-slate-700 font-medium"
                            >
                                画像を選択...
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Dimensions */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-teal-500 rounded-full"></span>
                棚割り情報（商品サイズ）
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                 <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">幅 (mm) <span className="text-danger font-bold">*</span></label>
                     <input 
                        type="number" 
                        className={getFieldClass(!(Number(activeProduct.width) > 0))}
                        value={activeProduct.width || ''}
                        onChange={(e) => handleProductChange(activeTab, 'width', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">高さ (mm) <span className="text-danger font-bold">*</span></label>
                     <input 
                        type="number" 
                        className={getFieldClass(!(Number(activeProduct.height) > 0))}
                        value={activeProduct.height || ''}
                        onChange={(e) => handleProductChange(activeTab, 'height', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1">奥行 (mm) <span className="text-danger font-bold">*</span></label>
                     <input 
                        type="number" 
                        className={getFieldClass(!(Number(activeProduct.depth) > 0))}
                        value={activeProduct.depth || ''}
                        onChange={(e) => handleProductChange(activeTab, 'depth', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">フェイシング数 <span className="text-danger font-bold">*</span></label>
                     <input 
                        type="number" 
                        className={getFieldClass(!(Number(activeProduct.facingCount) > 0))}
                        value={activeProduct.facingCount || ''}
                        onChange={(e) => handleProductChange(activeTab, 'facingCount', parseRequiredNumber(e.target.value))}
                     />
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Risk & Ingredients */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                リスク・成分
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">リスク分類 <span className="text-danger font-bold">*</span></label>
                    <select
                        className={getSelectClass(!hasText(activeProduct.riskClassification))}
                        value={activeProduct.riskClassification || ''}
                        onChange={(e) => handleProductChange(activeTab, 'riskClassification', e.target.value)}
                    >
                        <option value="">選択してください</option>
                        {masterData.riskClassifications.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                     <label className="block text-sm font-bold text-slate-700 mb-2">特定成分</label>
                     <div className="flex flex-wrap gap-2 sm:gap-3">
                        {masterData.specificIngredients.map(ing => (
                            <label key={ing} className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-full px-3 py-2 cursor-pointer hover:bg-slate-100 mb-1">
                                <input 
                                    type="checkbox" 
                                    className="form-checkbox text-primary rounded h-5 w-5 mr-2"
                                    checked={activeProduct.specificIngredients.includes(ing)}
                                    onChange={() => handleSpecificIngredientsChange(activeTab, ing)}
                                />
                                <span className="text-sm text-slate-700">{ing}</span>
                            </label>
                        ))}
                     </div>
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Arrival Date */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-cyan-500 rounded-full"></span>
                送込み店舗着日要望
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">送込み店舗着日要望</label>
                     <input 
                        type="date" 
                        className={getFieldClass()}
                        value={activeProduct.arrivalDate || ''}
                        onChange={(e) => handleProductChange(activeTab, 'arrivalDate', e.target.value)}
                     />
                     <p className="text-xs text-slate-500 mt-2">＊日程の確定は担当者とご相談ください</p>
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Sales Points */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                セールスポイント
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">キャッチコピー</label>
                     <textarea 
                        rows={3}
                        className={getTextareaClass()}
                        placeholder="例：胃のもたれには〇〇胃薬"
                        value={activeProduct.catchCopy}
                        onChange={(e) => handleProductChange(activeTab, 'catchCopy', e.target.value)}
                     />
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Promotion Info */}
        <section className="mb-6">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                販促物情報
            </h4>
        </section>

        <hr className="my-8 border-slate-200" />

        {/* Product: Other Info */}
        <section className="mb-6">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-slate-500 rounded-full"></span>
                その他
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">補足事項</label>
                    <textarea
                        rows={3}
                        className={getTextareaClass()}
                        placeholder="商品ブランドのURL等"
                        value={activeProduct.productNotes || ''}
                        onChange={(e) => handleProductChange(activeTab, 'productNotes', e.target.value)}
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">添付ファイル</label>
                    <input
                        type="file"
                        multiple
                        className="block w-full text-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                        onChange={(e) => {
                          const input = e.target;
                          void handleAddProductAttachments(activeTab, input.files).finally(() => {
                            input.value = '';
                          });
                        }}
                    />
                    <p className="text-xs text-slate-500 mt-1">※ 25MB以下</p>
                    {(activeProduct.productAttachments ?? []).length > 0 && (
                        <ul className="mt-3 space-y-2">
                            {(activeProduct.productAttachments ?? []).map((file, index) => (
                                <li key={`${file.name}-${index}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                                    <span className="text-slate-700">
                                        {file.name} <span className="text-slate-400">({formatBytes(file.size)})</span>
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <a
                                            href={getSafeDownloadUrl(file.url || file.dataUrl)}
                                            download={file.name}
                                            className="text-primary hover:underline"
                                        >
                                            ダウンロード
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveProductAttachment(activeTab, index)}
                                            className="text-danger hover:underline"
                                        >
                                            削除
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>

      </div>

      {/* Promotions Section */}
      <div className="mt-8">
        <h4 className={`${pageBlockTitleClass} mb-4 flex items-center gap-2`}>
          <span className="w-1 h-5 bg-orange-500 rounded-full"></span>
          販促物情報
          <span className="ml-1 text-sm font-normal text-slate-500">
            （{(formData.promotions || []).length}件）
          </span>
        </h4>

        {/* Promotions Tabs */}
        <div className="relative">
          <div className="flex items-center overflow-x-auto gap-2 mb-0 pb-2 no-scrollbar pr-8 sm:pr-0">
            <button
              onClick={addPromotion}
              className="flex items-center gap-1 px-3 sm:px-4 py-2 text-sm text-orange-600 font-bold hover:bg-orange-50 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus size={16} /> <span className="hidden sm:inline">販促物追加</span><span className="sm:hidden">追加</span>
            </button>
            {(formData.promotions || []).map((promo, idx) => {
              const tabState = getPromotionTabState(promo);
              return (
                <button
                  key={promo.id}
                  onClick={() => setActivePromotionTab(idx)}
                  className={`
                    px-3 sm:px-5 py-3 rounded-t-lg font-bold text-xs sm:text-sm whitespace-nowrap border-t border-l border-r flex-shrink-0 max-w-[120px] sm:max-w-none truncate
                    ${activePromotionTab === idx
                      ? 'bg-white border-slate-200 text-orange-600 z-10 relative -mb-[1px]'
                      : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}
                  `}
                  title={`販促物 ${idx + 1}`}
                >
                  <span>販促物 {idx + 1}</span>
                  <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tabState.tone}`}>
                    {tabState.label}
                  </span>
                </button>
              );
            })}
          </div>
          {(formData.promotions || []).length > 2 && (
            <div className="sm:hidden absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-slate-50 to-transparent flex items-center justify-end pointer-events-none">
              <ChevronRight size={16} className="text-slate-400 mr-1" />
            </div>
          )}
        </div>

        {/* Promotion Form Area */}
        {(formData.promotions || []).length > 0 && (() => {
          const activePromotion = (formData.promotions || [])[activePromotionTab];
          if (!activePromotion) return null;
          return (
            <div className="bg-white rounded-xl rounded-tl-none shadow-sm border border-slate-200 p-4 sm:p-8 relative">
              <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
                <button
                  onClick={() => removePromotion(activePromotionTab)}
                  className="p-2 text-slate-400 hover:text-danger hover:bg-red-50 rounded-full transition-colors"
                  title="この販促物を削除"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <section className="mb-10">
                <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                  販促物情報
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">サンプル仕様</label>
                    <input
                      type="text"
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      placeholder="例：商品サンプル同梱"
                      value={activePromotion.promoSample || ''}
                      onChange={(e) => handlePromotionChange(activePromotionTab, 'promoSample', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">特別什器等</label>
                    <input
                      type="text"
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      placeholder="例：専用什器"
                      value={activePromotion.specialFixture || ''}
                      onChange={(e) => handlePromotionChange(activePromotionTab, 'specialFixture', e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <hr className="my-8 border-slate-200" />

              <section className="mb-10">
                <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                  販促物サイズ
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">幅 (mm)</label>
                    <input
                      type="number"
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      value={activePromotion.promoWidth || ''}
                      onChange={(e) => handlePromotionChange(activePromotionTab, 'promoWidth', e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">高さ (mm)</label>
                    <input
                      type="number"
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      value={activePromotion.promoHeight || ''}
                      onChange={(e) => handlePromotionChange(activePromotionTab, 'promoHeight', e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">奥行 (mm)</label>
                    <input
                      type="number"
                      className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                      value={activePromotion.promoDepth || ''}
                      onChange={(e) => handlePromotionChange(activePromotionTab, 'promoDepth', e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>
              </section>

              <hr className="my-8 border-slate-200" />

              <section className="mb-10">
                <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                  販促物画像
                </h4>
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                  <div
                    className={`
                      w-full sm:w-40 h-48 sm:h-40 flex-shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden relative
                      ${!activePromotion.promoImage ? 'border-orange-200 bg-orange-100/70' : 'border-transparent bg-slate-100'}
                    `}
                    onClick={() => handlePromotionImageUpload(activePromotionTab)}
                  >
                    {activePromotion.promoImage ? (
                      <img src={activePromotion.promoImage} alt="Promotion" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-center p-2">
                        <ImageIcon className="mx-auto text-orange-400 mb-1" />
                        <span className="text-xs text-slate-500 font-bold">画像登録なし</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-sm text-slate-600">
                    <p className="mb-2"><strong>推奨:</strong> 300dpi相当 (2500px以上)。</p>
                    <p className="mb-3 text-slate-500">※登録可能な形式: ai / PNG / jpeg / eps</p>
                    <button
                      onClick={() => handlePromotionImageUpload(activePromotionTab)}
                      className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50 text-slate-700 font-medium"
                    >
                      画像を選択...
                    </button>
                  </div>
                </div>
              </section>
            </div>
          );
        })()}

        {(formData.promotions || []).length === 0 && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 mb-4">販促物情報がまだ登録されていません。</p>
            <button
              onClick={addPromotion}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus size={16} /> 販促物を追加
            </button>
          </div>
        )}
      </div>

      {isAdminUser && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mt-4 sm:mt-6">
        <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-violet-500 rounded-full"></span>
          Adminメモ
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">販促CD</label>
            {isAdminUser ? (
              <input
                type="text"
                className={`${getFieldClass()} font-mono`}
                value={formData.adminMemo?.promoCode || ''}
                onChange={(e) => handleAdminMemoChange('promoCode', normalizePromoCodeInput(e.target.value))}
                placeholder="X000000"
              />
            ) : (
              renderAutoValue(formData.adminMemo?.promoCode)
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ボードピッキングJAN</label>
            {isAdminUser ? (
              <input
                type="text"
                className={`${getFieldClass()} font-mono`}
                value={formData.adminMemo?.boardPickingJan || ''}
                onChange={(e) =>
                  handleAdminMemoChange(
                    'boardPickingJan',
                    normalizeJanCodeInput(e.target.value).slice(0, 13)
                  )
                }
                placeholder="9999999999999"
              />
            ) : (
              renderAutoValue(formData.adminMemo?.boardPickingJan)
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">期限表URL</label>
            {isAdminUser ? (
              <input
                type="url"
                className={getFieldClass()}
                value={formData.adminMemo?.deadlineTableUrl || ''}
                onChange={(e) => handleAdminMemoChange('deadlineTableUrl', e.target.value)}
                placeholder="https://drive.google.com/..."
              />
            ) : (
              renderAutoValue(formData.adminMemo?.deadlineTableUrl)
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">帯パターン</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.bandPattern || ''}
                  onChange={(e) =>
                    handleAdminMemoChange(
                      'bandPattern',
                      normalizeDigitsInput(e.target.value) || undefined
                    )
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">種</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.bandPattern, '種')
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">対象店舗数</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.targetStoreCount ?? ''}
                  onChange={(e) =>
                    handleAdminMemoChange('targetStoreCount', parseOptionalNumber(e.target.value))
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">店舗</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.targetStoreCount, '店舗')
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">印刷依頼数量 ボード①</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.printBoard1Count ?? ''}
                  onChange={(e) =>
                    handleAdminMemoChange('printBoard1Count', parseOptionalNumber(e.target.value))
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">枚</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.printBoard1Count, '枚')
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">印刷依頼数量 ボード②</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.printBoard2Count ?? ''}
                  onChange={(e) =>
                    handleAdminMemoChange('printBoard2Count', parseOptionalNumber(e.target.value))
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">枚</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.printBoard2Count, '枚')
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">印刷依頼数量 帯①</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.printBand1Count ?? ''}
                  onChange={(e) =>
                    handleAdminMemoChange('printBand1Count', parseOptionalNumber(e.target.value))
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">枚</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.printBand1Count, '枚')
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">印刷依頼数量 帯②</label>
            {isAdminUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-24 rounded-lg border border-slate-300 bg-white p-2.5 shadow-sm focus:border-primary focus:ring-primary"
                  value={formData.adminMemo?.printBand2Count ?? ''}
                  onChange={(e) =>
                    handleAdminMemoChange('printBand2Count', parseOptionalNumber(e.target.value))
                  }
                  placeholder="1"
                />
                <span className="text-sm text-slate-600">枚</span>
              </div>
            ) : (
              renderAutoValueWithUnit(formData.adminMemo?.printBand2Count, '枚')
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">印刷依頼数量 その他</label>
            {isAdminUser ? (
              <textarea
                rows={2}
                className={getTextareaClass()}
                value={formData.adminMemo?.printOther || ''}
                onChange={(e) => handleAdminMemoChange('printOther', e.target.value)}
              />
            ) : (
              renderAutoValue(formData.adminMemo?.printOther)
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">備品</label>
            {isAdminUser ? (
              <textarea
                rows={2}
                className={getTextareaClass()}
                value={formData.adminMemo?.equipmentNote || ''}
                onChange={(e) => handleAdminMemoChange('equipmentNote', e.target.value)}
              />
            ) : (
              renderAutoValue(formData.adminMemo?.equipmentNote)
            )}
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">備考</label>
            {isAdminUser ? (
              <textarea
                rows={3}
                className={getTextareaClass()}
                value={formData.adminMemo?.adminNote || ''}
                onChange={(e) => handleAdminMemoChange('adminNote', e.target.value)}
              />
            ) : (
              renderAutoValue(formData.adminMemo?.adminNote)
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
