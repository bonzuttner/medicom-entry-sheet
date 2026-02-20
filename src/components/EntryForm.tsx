import React, { useRef, useState, useEffect } from 'react';
import { EntrySheet, MasterData, ProductEntry } from '../types';
import { Save, ArrowLeft, Plus, Trash2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface EntryFormProps {
  initialData: EntrySheet;
  initialActiveTab?: number;
  masterData: MasterData;
  reusableProductTemplates: Record<string, ProductEntry>;
  onSave: (sheet: EntrySheet) => Promise<void> | void;
  onCancel: () => void;
}

const normalizeProductName = (value: string): string => value.trim().toLowerCase();

export const EntryForm: React.FC<EntryFormProps> = ({
  initialData,
  initialActiveTab = 0,
  masterData,
  reusableProductTemplates,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<EntrySheet>(initialData);
  const [activeTab, setActiveTab] = useState<number>(initialActiveTab); // Index of the product being edited
  const [isSaving, setIsSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const askedPrefillByProductRef = useRef<Map<number, string>>(new Map());

  const parseRequiredNumber = (value: string): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parseOptionalNumber = (value: string): number | undefined => {
    if (value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const normalizeJanCodeInput = (value: string): string =>
    value
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, '');

  // Sync update time
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      updatedAt: new Date().toISOString()
    }));
  }, [formData.products, formData.title, formData.email, formData.phoneNumber]);

  const handleHeaderChange = (field: keyof EntrySheet, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsDataURL(file);
  });

  const uploadFile = async (
    file: File,
    kind: 'image' | 'attachment'
  ): Promise<string> => {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch('/api/upload', {
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

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Upload failed (${response.status})`);
    }

    const payload = (await response.json()) as { url?: string };
    if (!payload.url) {
      throw new Error('Upload response does not include URL');
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
    shelfName: product.shelfName,
    manufacturerName: product.manufacturerName,
    janCode: product.janCode,
    productName: normalizeProductName(product.productName || ''),
    productImage: product.productImage || '',
    riskClassification: product.riskClassification,
    specificIngredients: [...product.specificIngredients].sort(),
    catchCopy: product.catchCopy,
    productMessage: product.productMessage,
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
      shelfName: masterData.shelfNames[0] || '',
      manufacturerName: formData.manufacturerName,
      janCode: '',
      productName: '',
      riskClassification: masterData.riskClassifications[0] || '',
      specificIngredients: [],
      catchCopy: '',
      productMessage: '',
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
        alert("担当者メールを入力してください");
        return;
    }
    if (!formData.phoneNumber) {
        alert("担当者電話番号を入力してください");
        return;
    }
    if (!formData.title) {
        alert("タイトルを入力してください");
        return;
    }
    
    if (status === 'completed') {
        if (shelfWidthTotal >= 840) {
            alert("棚割り幅合計が840mm以上のため完了できません。");
            return;
        }
        // Strict validation
        for (const p of formData.products) {
            if (!p.productName || !p.janCode || !p.productImage) {
                alert("必須項目が未入力の商品があります（商品名、JAN、商品画像など）");
                return;
            }
            if ((p.janCode.length !== 8 && p.janCode.length !== 13 && p.janCode.length !== 16)) { // 13 is standard JAN
                alert(`JANコードの桁数が正しくありません: ${p.productName}`);
                return;
            }
            if (p.hasPromoMaterial === 'yes' && (!p.promoWidth || !p.promoImage)) {
                alert(`販促物情報が不足しています: ${p.productName}`);
                return;
            }
        }
    }

    setIsSaving(true);
    try {
      await onSave({ ...formData, status });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for mock image upload
  const handleImageUpload = (index: number, field: 'productImage' | 'promoImage') => {
    const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
    const MIN_SHORT_SIDE_PX = 1500;
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
                alert("画像容量は50MB以下にしてください。");
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
              handleProductChange(index, field, url);
            } catch {
              alert(`画像のアップロードに失敗しました: ${file.name}`);
            }
        }
    };
    input.click();
  };

  const activeProduct = formData.products[activeTab];
  const promoImageFileName = getDisplayFileNameFromUrl(activeProduct.promoImage);
  const shelfWidthTotal = formData.products.reduce((sum, product) => {
    const width = Number(product.width) || 0;
    const facing = Number(product.facingCount) || 0;
    return sum + width * facing;
  }, 0);
  const isShelfWidthOver = shelfWidthTotal >= 840;

  return (
    <div className="pb-24 sm:pb-20">
      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 sm:p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
         <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-auto flex gap-3 order-2 sm:order-1">
                <button
                  onClick={onCancel}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none text-slate-600 font-medium px-4 py-3 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-2 border border-slate-200 sm:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowLeft size={20} /> <span className="inline">キャンセル</span>
                </button>
            </div>
            <div className="w-full sm:w-auto flex gap-3 order-1 sm:order-2">
                <button 
                    onClick={() => { void saveSheet('draft'); }}
                    disabled={isSaving || pendingUploads > 0}
                    className="flex-1 sm:flex-none px-4 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {pendingUploads > 0 ? 'アップロード中...' : isSaving ? '保存中...' : '一時保存'}
                </button>
                <button 
                    onClick={() => { void saveSheet('completed'); }}
                    disabled={isSaving || pendingUploads > 0}
                    className="flex-[2] sm:flex-none px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-sky-600 shadow-lg shadow-sky-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <Save size={20} />
                    {pendingUploads > 0 ? 'アップロード中...' : isSaving ? '保存中...' : '完了'}
                </button>
            </div>
         </div>
      </div>

      {/* Sheet Info (Header) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-4 mb-4">シート基本情報</h3>
        <div className="mb-6">
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
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
                    <label className="block text-sm font-bold text-slate-700 mb-2">作成者 <span className="text-danger">*</span></label>
                    <input 
                        type="text" 
                        value={formData.creatorName} 
                        onChange={(e) => handleHeaderChange('creatorName', e.target.value)}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-primary focus:ring-primary p-3" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">担当者メール <span className="text-danger">*</span></label>
                    <input 
                        type="email" 
                        value={formData.email} 
                        onChange={(e) => handleHeaderChange('email', e.target.value)}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-primary focus:ring-primary p-3" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">担当者電話番号 <span className="text-danger">*</span></label>
                    <input 
                        type="tel" 
                        value={formData.phoneNumber} 
                        onChange={(e) => handleHeaderChange('phoneNumber', e.target.value)}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-primary focus:ring-primary p-3" 
                    />
                </div>
            </div>
        </div>

        <div>
            <h4 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-sky-500 rounded-full"></span>
                詳細情報
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">タイトル <span className="text-danger">*</span></label>
                    <input 
                        type="text" 
                        value={formData.title} 
                        onChange={(e) => handleHeaderChange('title', e.target.value)}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-primary focus:ring-primary py-3 px-4 text-base sm:text-lg" 
                        placeholder="例：2024年秋の新商品プロモーション"
                    />
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">エントリシート補足情報</label>
                    <textarea
                        rows={3}
                        value={formData.notes || ''}
                        onChange={(e) => handleHeaderChange('notes', e.target.value)}
                        className="w-full border-slate-300 rounded-lg shadow-sm focus:border-primary focus:ring-primary p-3"
                        placeholder="自由入力"
                    />
                </div>
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">添付ファイル</label>
                    <input
                        type="file"
                        multiple
                        className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                        onChange={(e) => handleAddAttachments(e.target.files)}
                    />
                    <p className="text-xs text-slate-500 mt-1">※ 25MB以下</p>
                    {(formData.attachments ?? []).length > 0 && (
                        <ul className="mt-3 space-y-2">
                            {(formData.attachments ?? []).map((file, index) => (
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
                                            onClick={() => handleRemoveAttachment(index)}
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
                <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">棚割り幅合計 (mm) ＊自動計算</label>
                    <div className={`p-3 rounded-lg ${isShelfWidthOver ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-700'}`}>
                        {shelfWidthTotal.toLocaleString('ja-JP')} mm
                    </div>
                    <p className={`text-xs mt-1 ${isShelfWidthOver ? 'text-red-600' : 'text-slate-500'}`}>
                    商品情報ごとの「個装サイズ(幅) × フェイシング数」の合計値。840mm以下を推奨。
                    </p>
                </div>
            </div>
        </div>
      </div>

      {/* Products Tabs */}
      <div className="flex items-center overflow-x-auto gap-2 mb-0 pb-2 no-scrollbar">
        <button 
            onClick={addProduct}
            className="flex items-center gap-1 px-4 py-2 text-sm text-primary font-bold hover:bg-sky-50 rounded-lg transition-colors flex-shrink-0"
        >
            <Plus size={16} /> 商品追加
        </button>
        {formData.products.map((prod, idx) => (
            <button
                key={prod.id}
                onClick={() => setActiveTab(idx)}
                className={`
                    px-4 sm:px-5 py-3 rounded-t-lg font-bold text-sm whitespace-nowrap border-t border-l border-r flex-shrink-0
                    ${activeTab === idx 
                        ? 'bg-white border-slate-200 text-primary z-10 relative -mb-[1px]' 
                        : 'bg-slate-100 border-transparent text-slate-500 hover:bg-slate-200'}
                `}
            >
                {prod.productName || `商品 ${idx + 1}`}
                {!prod.productName && <span className="ml-2 text-warning">●</span>}
            </button>
        ))}
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

        {/* Product: Basic Info */}
        <section className="mb-8 sm:mb-10 mt-6 sm:mt-0">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-primary rounded-full"></span>
                商品情報
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">棚割名 <span className="text-danger">*</span></label>
                    <select 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 bg-white"
                        value={activeProduct.shelfName}
                        onChange={(e) => handleProductChange(activeTab, 'shelfName', e.target.value)}
                    >
                        {masterData.shelfNames.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">メーカー名 <span className="text-danger">*</span></label>
                     <input 
                        type="text" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary"
                        value={activeProduct.manufacturerName}
                        onChange={(e) => handleProductChange(activeTab, 'manufacturerName', e.target.value)}
                     />
                </div>
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">JANコード <span className="text-danger">*</span> <span className="text-xs font-normal text-slate-500">(8, 13, 16桁)</span></label>
                     <input 
                        type="text" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary font-mono"
                        placeholder="1234567890123"
                        value={activeProduct.janCode}
                        onChange={(e) => handleProductChange(activeTab, 'janCode', normalizeJanCodeInput(e.target.value))}
                        maxLength={16}
                     />
                </div>
                 <div className="md:col-span-2">
                     <label className="block text-sm font-bold text-slate-700 mb-2">商品名 <span className="text-danger">*</span></label>
                     <input 
                        type="text" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary"
                        placeholder="例：〇〇胃薬 A 30錠"
                        value={activeProduct.productName}
                        onChange={(e) => handleProductNameChange(activeTab, e.target.value)}
                        onBlur={(e) => maybeSuggestReusableProduct(activeTab, e.target.value)}
                     />
                </div>
                 {/* Product Image - Prominent */}
                 <div className="md:col-span-2 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 mb-2">
                    <label className="block text-base font-bold text-slate-700 mb-3">
                        商品画像 <span className="text-danger">*</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                        <div 
                            className={`
                                w-full sm:w-40 h-48 sm:h-40 flex-shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer bg-white overflow-hidden relative
                                ${!activeProduct.productImage ? 'border-warning bg-yellow-50' : 'border-slate-300'}
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
                            <p className="mb-2"><strong>推奨:</strong> 2500px × 3508px程度。</p>
                            <p className="mb-2 text-slate-500">※ 短辺1500px未満は解像度不足で登録できません。</p>
                            <p className="mb-3 text-slate-500">※A4で印刷可能な高解像度画像をアップロードしてください。容量が大きい場合は担当者へメール送付してください。</p>
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

        <hr className="my-8 border-slate-100" />

        {/* Product: Dimensions */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-teal-500 rounded-full"></span>
                棚割り情報（商品サイズ）
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">幅 (mm) <span className="text-danger">*</span></label>
                     <input 
                        type="number" 
                        className="w-full border-slate-300 rounded-lg p-3"
                        value={activeProduct.width || ''}
                        onChange={(e) => handleProductChange(activeTab, 'width', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">高さ (mm) <span className="text-danger">*</span></label>
                     <input 
                        type="number" 
                        className="w-full border-slate-300 rounded-lg p-3"
                        value={activeProduct.height || ''}
                        onChange={(e) => handleProductChange(activeTab, 'height', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">奥行 (mm) <span className="text-danger">*</span></label>
                     <input 
                        type="number" 
                        className="w-full border-slate-300 rounded-lg p-3"
                        value={activeProduct.depth || ''}
                        onChange={(e) => handleProductChange(activeTab, 'depth', parseRequiredNumber(e.target.value))}
                     />
                </div>
                <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">フェイシング数 <span className="text-danger">*</span></label>
                     <input 
                        type="number" 
                        className="w-full border-slate-300 rounded-lg p-3 bg-slate-50 font-bold"
                        value={activeProduct.facingCount || ''}
                        onChange={(e) => handleProductChange(activeTab, 'facingCount', parseRequiredNumber(e.target.value))}
                     />
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-100" />

        {/* Product: Risk & Ingredients */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                リスク・成分
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">リスク分類 <span className="text-danger">*</span></label>
                     <select 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 bg-white"
                        value={activeProduct.riskClassification}
                        onChange={(e) => handleProductChange(activeTab, 'riskClassification', e.target.value)}
                    >
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

        <hr className="my-8 border-slate-100" />

        {/* Product: Arrival Date */}
        <section className="mb-10">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-cyan-500 rounded-full"></span>
                送込み店舗着日
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">送込み店舗着日</label>
                     <input 
                        type="date" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3"
                        value={activeProduct.arrivalDate || ''}
                        onChange={(e) => handleProductChange(activeTab, 'arrivalDate', e.target.value)}
                     />
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-100" />

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
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary"
                        placeholder="例：胃のもたれには〇〇胃薬"
                        value={activeProduct.catchCopy}
                        onChange={(e) => handleProductChange(activeTab, 'catchCopy', e.target.value)}
                     />
                </div>
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">商品メッセージ (制作反映希望)</label>
                     <textarea 
                        rows={3}
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary"
                        placeholder="具体的な強みなど"
                        value={activeProduct.productMessage}
                        onChange={(e) => handleProductChange(activeTab, 'productMessage', e.target.value)}
                     />
                </div>
            </div>
        </section>

        <hr className="my-8 border-slate-100" />

        {/* Product: Promotion Info */}
        <section className="mb-6">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                販促情報
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">販促物の有無 <span className="text-danger">*</span></label>
                     <select 
                        className="w-full border-slate-300 rounded-lg py-3 px-3"
                        value={activeProduct.hasPromoMaterial}
                        onChange={(e) => handleProductChange(activeTab, 'hasPromoMaterial', e.target.value)}
                    >
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
                                className="w-full border-slate-300 rounded-lg p-3 bg-white"
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
                                className="w-full border-slate-300 rounded-lg p-3"
                                placeholder="例：前後陳列用什器"
                                value={activeProduct.specialFixture || ''}
                                onChange={(e) => handleProductChange(activeTab, 'specialFixture', e.target.value)}
                            />
                        </div>

                         <div className="md:col-span-2">
                             <label className="block text-sm font-bold text-slate-700 mb-2">販促物サイズ (mm) <span className="text-danger">*</span></label>
                             <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                <input 
                                    type="number" placeholder="幅" className="border-slate-300 rounded-lg p-3"
                                    value={activeProduct.promoWidth || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoWidth', parseOptionalNumber(e.target.value))}
                                />
                                <input 
                                    type="number" placeholder="高さ" className="border-slate-300 rounded-lg p-3"
                                    value={activeProduct.promoHeight || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoHeight', parseOptionalNumber(e.target.value))}
                                />
                                <input 
                                    type="number" placeholder="奥行" className="border-slate-300 rounded-lg p-3"
                                    value={activeProduct.promoDepth || ''}
                                    onChange={(e) => handleProductChange(activeTab, 'promoDepth', parseOptionalNumber(e.target.value))}
                                />
                             </div>
                        </div>

                         <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-2">販促物画像 <span className="text-danger">*</span></label>
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                <button 
                                    onClick={() => handleImageUpload(activeTab, 'promoImage')}
                                    className="w-full sm:w-auto px-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
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

        <hr className="my-8 border-slate-100" />

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
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary"
                        placeholder="自由入力"
                        value={activeProduct.productNotes || ''}
                        onChange={(e) => handleProductChange(activeTab, 'productNotes', e.target.value)}
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2">添付ファイル</label>
                    <input
                        type="file"
                        multiple
                        className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                        onChange={(e) => handleAddProductAttachments(activeTab, e.target.files)}
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
    </div>
  );
};
