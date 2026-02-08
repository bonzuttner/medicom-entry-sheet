import React, { useRef, useState, useEffect } from 'react';
import { EntrySheet, MasterData, ProductEntry } from '../types';
import { Save, ArrowLeft, Plus, Trash2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface EntryFormProps {
  initialData: EntrySheet;
  initialActiveTab?: number;
  masterData: MasterData;
  reusableProductTemplates: Record<string, ProductEntry>;
  onSave: (sheet: EntrySheet) => void;
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
      shelfName: masterData.shelfNames[0],
      manufacturerName: formData.manufacturerName,
      janCode: '',
      productName: '',
      riskClassification: masterData.riskClassifications[0] || '',
      specificIngredients: [],
      catchCopy: '',
      productMessage: '',
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

  const saveSheet = (status: 'draft' | 'completed') => {
    // Basic validation
    if (!formData.title) {
        alert("タイトルを入力してください");
        return;
    }
    
    if (status === 'completed') {
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

    onSave({ ...formData, status });
  };

  // Helper for mock image upload
  const handleImageUpload = (index: number, field: 'productImage' | 'promoImage') => {
    // Simulate file input click
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            if (file.size > 25 * 1024 * 1024) {
                alert("ファイルサイズは25MB以下にしてください。");
                return;
            }
            // Mock read
            const reader = new FileReader();
            reader.onload = (ev) => {
                handleProductChange(index, field, ev.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
  };

  const activeProduct = formData.products[activeTab];

  return (
    <div className="pb-24 sm:pb-20">
      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 sm:p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
         <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-auto flex gap-3 order-2 sm:order-1">
                <button onClick={onCancel} className="flex-1 sm:flex-none text-slate-600 font-medium px-4 py-3 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-2 border border-slate-200 sm:border-transparent">
                    <ArrowLeft size={20} /> <span className="inline">キャンセル</span>
                </button>
            </div>
            <div className="w-full sm:w-auto flex gap-3 order-1 sm:order-2">
                <button 
                    onClick={() => saveSheet('draft')} 
                    className="flex-1 sm:flex-none px-4 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors whitespace-nowrap"
                >
                    一時保存
                </button>
                <button 
                    onClick={() => saveSheet('completed')}
                    className="flex-[2] sm:flex-none px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-sky-600 shadow-lg shadow-sky-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                    <Save size={20} />
                    完了
                </button>
            </div>
         </div>
      </div>

      {/* Sheet Info (Header) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-4 mb-4">シート基本情報</h3>
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
            <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">メーカー名 (自動入力)</label>
                <div className="p-3 bg-slate-100 rounded-lg text-slate-700">{formData.manufacturerName}</div>
            </div>
             <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">作成者 (自動入力)</label>
                <div className="p-3 bg-slate-100 rounded-lg text-slate-700">{formData.creatorName}</div>
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
                            <p className="mb-2"><strong>推奨:</strong> 300dpi相当 (2500px以上)。25MB以下。</p>
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
                     <label className="block text-sm font-bold text-slate-700 mb-2">リスク分類 <span className="text-danger">*</span></label>
                     <select 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 bg-white"
                        value={activeProduct.riskClassification}
                        onChange={(e) => handleProductChange(activeTab, 'riskClassification', e.target.value)}
                    >
                        {masterData.riskClassifications.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">JANコード <span className="text-danger">*</span> <span className="text-xs font-normal text-slate-500">(8, 13, 16桁)</span></label>
                     <input 
                        type="text" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3 focus:ring-primary focus:border-primary font-mono"
                        placeholder="1234567890123"
                        value={activeProduct.janCode}
                        onChange={(e) => handleProductChange(activeTab, 'janCode', e.target.value.replace(/[^0-9]/g, ''))}
                        maxLength={16}
                     />
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

        {/* Product: Promotion Info */}
        <section className="mb-6">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                販促情報
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                 <div>
                     <label className="block text-sm font-bold text-slate-700 mb-2">送込み店舗着日</label>
                     <input 
                        type="date" 
                        className="w-full border-slate-300 rounded-lg py-3 px-3"
                        value={activeProduct.arrivalDate || ''}
                        onChange={(e) => handleProductChange(activeTab, 'arrivalDate', e.target.value)}
                     />
                </div>
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
                                    <span className="text-success font-medium flex items-center gap-1">
                                        <ImageIcon size={16} /> 登録済み
                                    </span>
                                ) : (
                                    <span className="text-danger font-medium text-sm">※登録必須</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>

      </div>
    </div>
  );
};
