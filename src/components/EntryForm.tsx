import React, { useRef, useState, useEffect } from 'react';
import { Creative, EntrySheet, EntrySheetRevision, FaceOption, MasterData, ProductEntry, User, UserRole } from '../types';
import { Save, Plus, Trash2, AlertTriangle, Image as ImageIcon, Search, ChevronRight, FileText, PlusCircle, RefreshCw, Package, CheckCircle, RotateCcw, Edit3 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { dataService } from '../services/dataService';
import { getCurrentAssigneeLabel, getWorkflowStatusView } from '../lib/sheetWorkflow';

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
  onSaveWorkflow: (sheet: EntrySheet) => Promise<EntrySheet>;
  onCancel: () => void;
  onOpenCreatives?: () => void;
  onRelinkCreative?: (
    sheetId: string,
    targetCreativeId: string
  ) => Promise<{ sheet: EntrySheet; creative: Creative }>;
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
  onSaveWorkflow,
  onCancel,
  onOpenCreatives,
  onRelinkCreative,
}) => {
  const sectionTitleClass = 'text-base font-bold text-slate-800';
  const pageBlockTitleClass = 'text-lg font-bold text-slate-800';
  const helpTextClass = 'mt-1 text-xs text-slate-500';
  const toCreativePreview = (creative: EntrySheet['creative']): Creative | null =>
    creative
      ? ({
          id: creative.id || '',
          version: 1,
          manufacturerName: initialData.manufacturerName,
          creatorId: '',
          creatorName: '',
          name: creative.name,
          imageUrl: creative.imageUrl,
          memo: '',
          createdAt: creative.updatedAt,
          updatedAt: creative.updatedAt,
          linkedSheets: [],
        } as Creative)
      : null;
  const [formData, setFormData] = useState<EntrySheet>(initialData);
  const [activeTab, setActiveTab] = useState<number>(initialActiveTab); // Index of the product being edited
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<ProductEntry[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const [linkedCreative, setLinkedCreative] = useState<Creative | null>(toCreativePreview(initialData.creative));
  const [creativePickerOpen, setCreativePickerOpen] = useState(false);
  const [creativePickerQuery, setCreativePickerQuery] = useState('');
  const [creativeOptions, setCreativeOptions] = useState<Creative[]>([]);
  const [isLoadingCreativeOptions, setIsLoadingCreativeOptions] = useState(false);
  const [isRelinkingCreative, setIsRelinkingCreative] = useState(false);
  const [isPreparingReturn, setIsPreparingReturn] = useState(false);
  const [isCreativeImageModalOpen, setIsCreativeImageModalOpen] = useState(false);
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
  const resolveAssigneeFromWorkflow = (
    entryStatus: EntrySheet['entryStatus'] | EntrySheet['status'] | undefined,
    creativeStatus: EntrySheet['creativeStatus'] | undefined,
    changedByRole: UserRole
  ): 'admin' | 'manufacturer_user' | 'none' => {
    if (creativeStatus === 'approved') return 'none';
    if (creativeStatus === 'confirmation_pending') return 'manufacturer_user';
    if (creativeStatus === 'in_progress') return 'admin';
    if (creativeStatus === 'returned') {
      return changedByRole === UserRole.ADMIN ? 'manufacturer_user' : 'admin';
    }
    return entryStatus === 'draft' ? 'manufacturer_user' : 'admin';
  };

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
    let mounted = true;
    if (!initialData.id) {
      setLinkedCreative(toCreativePreview(initialData.creative));
      return;
    }
    void dataService
      .getCreativeBySheetId(initialData.id)
      .then((creative) => {
        if (!mounted) return;
        setLinkedCreative(creative || toCreativePreview(initialData.creative));
      })
      .catch((error) => {
        console.error('Failed to load linked creative:', error);
        if (!mounted) return;
        setLinkedCreative(toCreativePreview(initialData.creative));
      });
    return () => {
      mounted = false;
    };
  }, [initialData.creative, initialData.id, initialData.manufacturerName]);

  useEffect(() => {
    if (!creativePickerOpen || !isAdminUser) return;
    let mounted = true;
    setIsLoadingCreativeOptions(true);
    void dataService
      .getCreatives()
      .then((rows) => {
        if (!mounted) return;
        setCreativeOptions(rows);
      })
      .catch((error) => {
        console.error('Failed to load creatives for picker:', error);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingCreativeOptions(false);
      });
    return () => {
      mounted = false;
    };
  }, [creativePickerOpen, isAdminUser]);

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

  const isEligibleAssignee = (
    assigneeType: EntrySheet['currentAssignee'],
    user: User | undefined
  ): boolean => {
    if (!user) return false;
    if (assigneeType === 'admin') return user.role === UserRole.ADMIN;
    if (assigneeType === 'manufacturer_user') {
      return user.manufacturerName === formData.manufacturerName;
    }
    return false;
  };

  const saveWorkflowChange = async (
    nextCreativeStatus: EntrySheet['creativeStatus'],
    nextCurrentAssignee?: EntrySheet['currentAssignee'],
    nextReturnReason?: string,
    nextAssigneeUserId?: string
  ) => {
    if (isSaving) return;

    const resolvedAssignee =
      nextCurrentAssignee ||
      resolveAssigneeFromWorkflow(
        formData.entryStatus || formData.status,
        nextCreativeStatus,
        currentUser.role
      );
    const normalizedReturnReason =
      nextCreativeStatus === 'returned'
        ? String(nextReturnReason || '').trim()
        : undefined;
    const candidateAssigneeUserId = nextAssigneeUserId ?? formData.assigneeUserId;
    const candidateAssigneeUser = users.find((user) => user.id === candidateAssigneeUserId);
    const resolvedAssigneeUserId =
      resolvedAssignee === 'none' || !isEligibleAssignee(resolvedAssignee, candidateAssigneeUser)
        ? undefined
        : candidateAssigneeUserId;
    const workflowPayload: EntrySheet = {
      ...formData,
      updatedAt: new Date().toISOString(),
      creativeStatus: nextCreativeStatus,
      currentAssignee: resolvedAssignee,
      assigneeUserId: resolvedAssigneeUserId,
      returnReason: normalizedReturnReason,
    };

    setIsSaving(true);
    try {
      const savedSheet = await onSaveWorkflow(workflowPayload);
      setFormData((prev) => ({
        ...prev,
        ...savedSheet,
      }));
      setIsPreparingReturn(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : '進行状況の更新に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const startReturnFlow = () => {
    setIsPreparingReturn(true);
    setFormData((prev) => ({
      ...prev,
      returnReason: prev.returnReason || '',
    }));
  };

  const cancelReturnFlow = () => {
    setIsPreparingReturn(false);
    setFormData((prev) => ({
      ...prev,
      returnReason: (prev.creativeStatus || 'none') === 'returned' ? prev.returnReason : undefined,
    }));
  };

  const confirmReturnFlow = () => {
    if (!hasText(formData.returnReason)) {
      alert('差し戻し理由を入力してください。');
      return;
    }
    void saveWorkflowChange(
      'returned',
      resolveAssigneeFromWorkflow(formData.entryStatus || formData.status, 'returned', currentUser.role),
      formData.returnReason,
      formData.assigneeUserId
    );
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
    hasPromoMaterial: product.hasPromoMaterial,
    promoSample: product.promoSample || '',
    specialFixture: product.specialFixture || '',
    promoWidth: product.promoWidth ?? '',
    promoHeight: product.promoHeight ?? '',
    promoDepth: product.promoDepth ?? '',
    promoImage: product.promoImage || '',
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
      hasPromoMaterial: 'no',
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
            if (p.hasPromoMaterial === 'yes') {
                const promoMissing: string[] = [];
                if (!p.promoWidth) promoMissing.push('販促物幅');
                if (!p.promoImage) promoMissing.push('販促物画像');
                if (promoMissing.length > 0) {
                  alert(`商品${index + 1}（${p.productName}）の販促物情報が不足しています: ${promoMissing.join('、')}`);
                  return;
                }
            }
            if (!/^\d+$/.test(p.janCode)) {
                alert(`商品${index + 1}（${p.productName}）のJANコードは半角数字のみ入力してください。`);
                return;
            }
        }
    }

    const shouldResetReturnedWorkflow =
      !isAdminUser && status === 'completed' && (formData.creativeStatus || 'none') === 'returned';
    const nextCreativeStatus = shouldResetReturnedWorkflow ? 'none' : formData.creativeStatus;
    const nextCurrentAssignee = shouldResetReturnedWorkflow
      ? resolveAssigneeFromWorkflow(finalStatus, nextCreativeStatus, currentUser.role)
      : formData.currentAssignee;
    const nextAssigneeUser = users.find((user) => user.id === formData.assigneeUserId);
    const nextAssigneeUserId =
      nextCurrentAssignee === 'none' || !isEligibleAssignee(nextCurrentAssignee, nextAssigneeUser)
        ? undefined
        : formData.assigneeUserId;
    const nextReturnReason = shouldResetReturnedWorkflow ? undefined : formData.returnReason;

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        status: finalStatus,
        entryStatus: finalStatus,
        creativeStatus: nextCreativeStatus,
        currentAssignee: nextCurrentAssignee,
        assigneeUserId: nextAssigneeUserId,
        returnReason: nextReturnReason,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for mock image upload
  const handleImageUpload = (index: number, field: 'productImage' | 'promoImage') => {
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
            if (field === 'productImage' && (file.size <= 0 || file.size > MAX_IMAGE_BYTES)) {
                alert("画像容量は25MB以下にしてください。");
                return;
            }
            try {
              if (field === 'productImage') {
                const { width, height } = await getImageDimensions(file);
                const shortSide = Math.min(width, height);
                if (shortSide < MIN_SHORT_SIDE_PX) {
                  alert(`解像度不足です（短辺${MIN_SHORT_SIDE_PX}px未満）。`);
                  return;
                }
              }
              const uploadKind = field === 'promoImage' ? 'promo' : 'image';
              const url = await runTrackedUpload(() => uploadFile(file, uploadKind));
              handleProductChange(index, field, url);
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
                if (field === 'productImage') {
                  alert(`商品画像の解像度が不足しています（${file.name}）。短辺1000px以上の画像を選択してください。`);
                  return;
                }
                alert(`画像の解像度要件に合致していません（${file.name}）。`);
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
  const promoImageFileName = getDisplayFileNameFromUrl(activeProduct.promoImage);
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
  const currentCreativeStatus = formData.creativeStatus || 'none';
  const currentEntryStatus = formData.entryStatus || formData.status;
  const resolvedCurrentAssignee =
    formData.currentAssignee ||
    resolveAssigneeFromWorkflow(
      formData.entryStatus || formData.status,
      formData.creativeStatus,
      currentUser.role
    );
  const assigneeLabel = getCurrentAssigneeLabel(resolvedCurrentAssignee);
  const assigneeCandidates = users.filter((user) =>
    isEligibleAssignee(resolvedCurrentAssignee, user)
  );
  const selectedAssigneeUser = assigneeCandidates.find((user) => user.id === formData.assigneeUserId);
  const canRelinkCreative =
    isAdminUser &&
    currentEntryStatus !== 'draft' &&
    (currentCreativeStatus === 'none' || currentCreativeStatus === 'in_progress');
  const filteredCreativeOptions = creativeOptions.filter((creative) => {
    if (creative.manufacturerName !== formData.manufacturerName) return false;
    const query = normalizeSearchText(creativePickerQuery);
    if (!query) return true;
    return [creative.name, creative.memo || '', ...creative.linkedSheets.flatMap((sheet) => [
      sheet.sheetCode || '',
      sheet.title,
      sheet.manufacturerName,
      sheet.shelfName,
      sheet.caseName,
    ])].some((value) => normalizeSearchText(value).includes(query));
  });
  const handleRelinkCreative = async (targetCreativeId: string) => {
    if (!onRelinkCreative || !initialData.id || isRelinkingCreative) return;
    try {
      setIsRelinkingCreative(true);
      const result = await onRelinkCreative(initialData.id, targetCreativeId);
      setLinkedCreative(result.creative);
      setFormData((prev) => ({
        ...prev,
        version: result.sheet.version,
        updatedAt: result.sheet.updatedAt,
        creativeStatus: result.sheet.creativeStatus,
        currentAssignee: result.sheet.currentAssignee,
        assigneeUserId: result.sheet.assigneeUserId,
        assigneeUsername: result.sheet.assigneeUsername,
        returnReason: result.sheet.returnReason,
      }));
      setCreativePickerOpen(false);
      setCreativePickerQuery('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'クリエイティブの差し替えに失敗しました。');
    } finally {
      setIsRelinkingCreative(false);
    }
  };
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
    const promoChecks =
      product.hasPromoMaterial === 'yes'
        ? [Number(product.promoWidth) > 0, hasText(product.promoImage)]
        : [];
    const allFilled = [...coreChecks, ...promoChecks].every(Boolean);
    if (allFilled) {
      return { label: '完了', tone: 'bg-emerald-100 text-emerald-700' };
    }
    const anyFilled = [...coreChecks, ...promoChecks].some(Boolean);
    if (anyFilled) {
      return { label: '入力中', tone: 'bg-amber-100 text-amber-700' };
    }
    return { label: '未入力', tone: 'bg-slate-100 text-slate-600' };
  };
  return (
    <div className="pb-24 sm:pb-20">
      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        {/* 差し戻し理由入力（フッター上部） */}
        {isPreparingReturn && (
          <div className="border-b border-slate-200 bg-rose-50/80 px-3 sm:px-4 py-3">
            <div className="max-w-7xl mx-auto">
              <label className="mb-2 block text-sm font-bold text-rose-900">差し戻し理由</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={formData.returnReason || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      returnReason: event.target.value,
                    }))
                  }
                  placeholder="差し戻しの理由を入力してください"
                  className="flex-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelReturnFlow}
                    className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !hasText(formData.returnReason)}
                    onClick={confirmReturnFlow}
                    className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    差し戻しを確定
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 差し戻し理由表示 */}
        {currentCreativeStatus === 'returned' && hasText(formData.returnReason) && !isPreparingReturn && (
          <div className="border-b border-amber-200 bg-amber-50/80 px-3 sm:px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <span className="font-semibold">差し戻し理由:</span> {formData.returnReason}
              </div>
            </div>
          </div>
        )}
        {/* メインアクションバー */}
        <div className="p-3 sm:p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            {/* 左: ステータス + 担当 */}
            <div className="hidden sm:flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${workflowStatus.pillClassName}`}>
                {workflowStatus.label}
              </span>
              <span className="text-sm text-slate-600">担当: {assigneeLabel}</span>
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
              {/* Admin: 制作を開始 (completed + none) */}
              {isAdminUser && currentCreativeStatus === 'none' && currentEntryStatus !== 'draft' && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => { void saveWorkflowChange('in_progress'); }}
                  className="px-4 sm:px-6 py-2.5 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? '処理中...' : '制作を開始'}
                </button>
              )}
              {/* Admin: 確認依頼 (in_progress) */}
              {isAdminUser && currentCreativeStatus === 'in_progress' && (
                <button
                  type="button"
                  disabled={isSaving || !linkedCreative}
                  onClick={() => { void saveWorkflowChange('confirmation_pending'); }}
                  className="px-4 sm:px-6 py-2.5 bg-violet-600 text-white font-bold rounded-lg hover:bg-violet-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? '処理中...' : '確認依頼'}
                </button>
              )}
              {/* Admin: 再編集 (confirmation_pending) */}
              {isAdminUser && currentCreativeStatus === 'confirmation_pending' && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => { void saveWorkflowChange('in_progress'); }}
                  className="px-4 sm:px-6 py-2.5 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? '処理中...' : '再編集'}
                </button>
              )}
              {/* メーカー: 差し戻す + 承認する (confirmation_pending) */}
              {!isAdminUser && currentCreativeStatus === 'confirmation_pending' && (
                <>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={startReturnFlow}
                    className="px-4 py-2.5 bg-rose-100 text-rose-800 font-bold rounded-lg hover:bg-rose-200 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    差し戻す
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => { void saveWorkflowChange('approved'); }}
                    className="px-4 sm:px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSaving ? '処理中...' : '承認する'}
                  </button>
                </>
              )}
              {/* Admin: 制作に戻す (returned / approved) */}
              {isAdminUser && (currentCreativeStatus === 'returned' || currentCreativeStatus === 'approved') && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => { void saveWorkflowChange('in_progress'); }}
                  className="px-4 sm:px-6 py-2.5 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? '処理中...' : '制作に戻す'}
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
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${workflowStatus.pillClassName}`}>
              {workflowStatus.label}
            </span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">担当:</span>
              <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700">
                {assigneeLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">担当者:</span>
              <select
                value={selectedAssigneeUser?.id || ''}
                onChange={(event) => {
                  const nextAssigneeUserId = event.target.value || undefined;
                  const nextAssigneeUser = assigneeCandidates.find((user) => user.id === nextAssigneeUserId);
                  setFormData((prev) => ({
                    ...prev,
                    assigneeUserId: nextAssigneeUserId,
                    assigneeUsername: nextAssigneeUser?.displayName || nextAssigneeUser?.username,
                  }));
                  void saveWorkflowChange(
                    currentCreativeStatus,
                    resolvedCurrentAssignee,
                    currentCreativeStatus === 'returned' ? formData.returnReason : undefined,
                    nextAssigneeUserId
                  );
                }}
                disabled={isSaving || resolvedCurrentAssignee === 'none'}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">未割り当て</option>
                {assigneeCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName || user.username}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
                            onClick={() => handleImageUpload(activeTab, 'productImage')}
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
                                onClick={() => handleImageUpload(activeTab, 'productImage')}
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">販促物の有無 <span className="text-danger font-bold">*</span></label>
                    <select
                        className={getSelectClass(!hasText(activeProduct.hasPromoMaterial))}
                        value={activeProduct.hasPromoMaterial || ''}
                        onChange={(e) => handleProductChange(activeTab, 'hasPromoMaterial', e.target.value)}
                    >
                        <option value="">選択してください</option>
                        <option value="no">無し</option>
                        <option value="yes">有り</option>
                    </select>
                </div>
            </div>

            {/* Conditional Promo Fields */}
            {activeProduct.hasPromoMaterial === 'yes' && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 sm:p-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <h5 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                        <AlertTriangle size={18} />
                        販促物詳細入力
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">香り・色見本</label>
                            <select 
                                className={getSelectClass()}
                                value={activeProduct.promoSample || '無し'}
                                onChange={(e) => handleProductChange(activeTab, 'promoSample', e.target.value)}
                            >
                                <option value="無し">無し</option>
                                <option value="有り">有り</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">特殊な陳列什器</label>
                            <input 
                                type="text" 
                                className={getFieldClass()}
                                placeholder="例：前後陳列用什器"
                                value={activeProduct.specialFixture || ''}
                                onChange={(e) => handleProductChange(activeTab, 'specialFixture', e.target.value)}
                            />
                        </div>

                         <div className="md:col-span-2">
                             <label className="block text-sm font-bold text-slate-700 mb-2">販促物サイズ (mm) <span className="text-danger font-bold">*</span></label>
                             <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                <input 
                                    type="number" placeholder="幅" className={getFieldClass(!(Number(activeProduct.promoWidth) > 0))}
                                    value={activeProduct.promoWidth || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoWidth', parseOptionalNumber(e.target.value))}
                                />
                                <input 
                                    type="number" placeholder="高さ" className={getFieldClass()}
                                    value={activeProduct.promoHeight || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoHeight', parseOptionalNumber(e.target.value))}
                                />
                                <input 
                                    type="number" placeholder="奥行" className={getFieldClass()}
                                    value={activeProduct.promoDepth || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoDepth', parseOptionalNumber(e.target.value))}
                                />
                             </div>
                        </div>

                         <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">販促物画像 <span className="text-danger font-bold">*</span></label>
                            <div className={`flex flex-col sm:flex-row gap-4 items-start sm:items-center rounded-lg p-3 ${activeProduct.promoImage ? 'bg-slate-100' : 'bg-amber-100/70'}`}>
                                <button 
                                    onClick={() => handleImageUpload(activeTab, 'promoImage')}
                                    className="w-full sm:w-auto rounded-lg bg-white px-4 py-3 text-slate-700 shadow-sm hover:bg-slate-50"
                                >
                                    画像を選択...
                                </button>
                                {activeProduct.promoImage ? (
                                    <div className="text-success font-medium flex flex-col gap-1">
                                        <span className="flex items-center gap-1">
                                            <ImageIcon size={16} /> 登録済み
                                        </span>
                                        {promoImageFileName ? (
                                            <span className="text-xs text-slate-600 break-all">{promoImageFileName}</span>
                                        ) : null}
                                    </div>
                                ) : (
                                    <span className="text-danger font-medium text-sm">※登録必須</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
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

      <div className="mt-8">
        <h4 className={`${sectionTitleClass} mb-4 flex items-center gap-2`}>
          <span className="w-1 h-5 bg-sky-500 rounded-full"></span>
          紐づくクリエイティブ
        </h4>
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {linkedCreative ? (
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => setIsCreativeImageModalOpen(true)}
                    className="flex h-24 w-36 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-sky-400"
                    style={{ cursor: 'zoom-in' }}
                  >
                    <img src={linkedCreative.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{linkedCreative.name}</div>
                    {linkedCreative.memo && (
                      <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 whitespace-pre-wrap">
                        {linkedCreative.memo}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-slate-500">
                      最終更新日: {formatDate(linkedCreative.updatedAt)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">まだクリエイティブは紐づいていません。</p>
              )}
            </div>
            {canRelinkCreative && onRelinkCreative && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreativePickerOpen((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 font-semibold text-sky-700 shadow-sm transition-all hover:bg-sky-100"
                >
                  {linkedCreative ? 'クリエイティブを差し替え' : 'クリエイティブを紐づけ'}
                </button>
              </div>
            )}
          </div>
          {canRelinkCreative && creativePickerOpen && onRelinkCreative && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-800">差し替え先クリエイティブを選択</div>
                  <div className="mt-1 text-xs text-slate-500">
                    同じメーカーのクリエイティブから選択します。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreativePickerOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                >
                  閉じる
                </button>
              </div>
              <div className="mt-4">
                <input
                  value={creativePickerQuery}
                  onChange={(event) => setCreativePickerQuery(event.target.value)}
                  placeholder="クリエイティブ名 / シート名 / ID / 棚割り名 / 案件名で検索"
                  className={getFieldClass()}
                />
              </div>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {isLoadingCreativeOptions ? (
                  <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">読み込み中...</div>
                ) : filteredCreativeOptions.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    差し替え可能なクリエイティブが見つかりません。
                  </div>
                ) : (
                  filteredCreativeOptions.map((creative) => {
                    const isCurrent = creative.id === linkedCreative?.id;
                    return (
                      <button
                        key={creative.id}
                        type="button"
                        disabled={isCurrent || isRelinkingCreative}
                        onClick={() => {
                          void handleRelinkCreative(creative.id);
                        }}
                        className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${
                          isCurrent
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                            : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50'
                        }`}
                      >
                        <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                          <img src={creative.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-800">{creative.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {creative.linkedSheets.length > 0
                              ? `${creative.linkedSheets[0].sheetCode || creative.linkedSheets[0].id.slice(0, 8)} | ${creative.linkedSheets[0].title}`
                              : '未紐づき'}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            更新日: {formatDate(creative.updatedAt)}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-sky-700">
                          {isCurrent ? '現在選択中' : isRelinkingCreative ? '差し替え中...' : '差し替え'}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isAdminUser && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mt-4 sm:mt-6">
        <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-violet-500 rounded-full"></span>
          Adminメモ（管理者のみ編集）
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

      {/* クリエイティブ画像拡大モーダル */}
      {isCreativeImageModalOpen && linkedCreative && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setIsCreativeImageModalOpen(false)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={() => setIsCreativeImageModalOpen(false)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-lg hover:bg-slate-100"
            >
              ✕
            </button>
            <img
              src={linkedCreative.imageUrl}
              alt={linkedCreative.name}
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            />
            <div className="mt-2 text-center text-sm text-white">{linkedCreative.name}</div>
          </div>
        </div>
      )}
    </div>
  );
};
