import React, { useEffect, useState } from 'react';
import { MasterData } from '../types';
import { Plus, X } from 'lucide-react';

interface MasterManageProps {
  data: MasterData;
  onSave: (data: MasterData) => Promise<void> | void;
}

export const MasterManage: React.FC<MasterManageProps> = ({ data, onSave }) => {
  const [localData, setLocalData] = useState<MasterData>(data);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedManufacturer, setSelectedManufacturer] = useState('');

  useEffect(() => {
    setLocalData(data);
    if (
      data.manufacturerNames.length > 0 &&
      (!selectedManufacturer || !data.manufacturerNames.includes(selectedManufacturer))
    ) {
      setSelectedManufacturer(data.manufacturerNames[0]);
    }
  }, [data]);

  const normalizeItem = (value: string): string => value.trim();

  const persist = async (newData: MasterData) => {
    setLocalData(newData);
    setIsSaving(true);
    try {
      await onSave(newData);
    } finally {
      setIsSaving(false);
    }
  };

  const addItem = async (category: keyof MasterData, rawValue: string) => {
    const value = normalizeItem(rawValue);
    if (!value) return;

    if (localData[category].some((existing) => existing.trim() === value)) {
      return;
    }

    const newData = { ...localData, [category]: [...localData[category], value] };
    await persist(newData);
  };

  const removeItem = async (category: keyof MasterData, value: string) => {
    if(!window.confirm(`「${value}」を削除しますか？`)) return;
    const newData = { ...localData, [category]: localData[category].filter(v => v !== value) };
    await persist(newData);
  };

  const getShelfNamesForSelectedManufacturer = (): string[] => {
    if (!selectedManufacturer) return [];
    return localData.manufacturerShelfNames?.[selectedManufacturer] || [];
  };

  const addShelfName = async (rawValue: string) => {
    const value = normalizeItem(rawValue);
    if (!value || !selectedManufacturer) return;
    const current = getShelfNamesForSelectedManufacturer();
    if (current.some((existing) => existing.trim() === value)) {
      return;
    }
    const manufacturerShelfNames = {
      ...(localData.manufacturerShelfNames || {}),
      [selectedManufacturer]: [...current, value],
    };
    await persist({ ...localData, manufacturerShelfNames });
  };

  const removeShelfName = async (value: string) => {
    if (!selectedManufacturer) return;
    if (!window.confirm(`「${value}」を削除しますか？`)) return;
    const current = getShelfNamesForSelectedManufacturer();
    const manufacturerShelfNames = {
      ...(localData.manufacturerShelfNames || {}),
      [selectedManufacturer]: current.filter((v) => v !== value),
    };
    await persist({ ...localData, manufacturerShelfNames });
  };

  const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const getDefaultStartMonthsForSelectedManufacturer = (): number[] => {
    if (!selectedManufacturer) return [];
    return localData.manufacturerDefaultStartMonths?.[selectedManufacturer] || [];
  };

  const toggleDefaultStartMonth = async (month: number) => {
    if (!selectedManufacturer) return;
    const current = getDefaultStartMonthsForSelectedManufacturer();
    const next = current.includes(month)
      ? current.filter((m) => m !== month)
      : [...current, month].sort((a, b) => a - b);
    const manufacturerDefaultStartMonths = {
      ...(localData.manufacturerDefaultStartMonths || {}),
      [selectedManufacturer]: next,
    };
    await persist({ ...localData, manufacturerDefaultStartMonths });
  };

  return (
    <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-800">マスタ管理</h2>
        <p className="text-slate-500">エントリーシートのプルダウン選択肢を編集します。</p>

        <MasterSection 
            title="メーカー名" 
            items={localData.manufacturerNames} 
            onAdd={(v) => addItem('manufacturerNames', v)} 
            onRemove={(v) => removeItem('manufacturerNames', v)} 
            isSaving={isSaving}
        />

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-lg">棚割名（メーカー別）</h3>
            <p className="text-sm text-slate-500">メーカーを選択して棚割名を管理します。</p>
            <select
              className="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2"
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
            >
              {localData.manufacturerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <MasterSection
              title={selectedManufacturer ? `棚割名: ${selectedManufacturer}` : '棚割名'}
              items={getShelfNamesForSelectedManufacturer()}
              onAdd={addShelfName}
              onRemove={removeShelfName}
              isSaving={isSaving}
            />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-lg">デフォルト展開スタート月（メーカー別）</h3>
            <p className="text-sm text-slate-500">メーカーごとに複数指定できます。エントリーシート新規作成時に候補として使用されます。</p>
            <select
              className="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2"
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
            >
              {localData.manufacturerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {monthLabels.map((label, index) => {
                const month = index + 1;
                const checked = getDefaultStartMonthsForSelectedManufacturer().includes(month);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      void toggleDefaultStartMonth(month);
                    }}
                    disabled={isSaving}
                    className={`px-3 py-2 rounded-lg border text-sm ${
                      checked
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
        </div>
        
        <MasterSection 
            title="リスク分類" 
            items={localData.riskClassifications} 
            onAdd={(v) => addItem('riskClassifications', v)} 
            onRemove={(v) => removeItem('riskClassifications', v)} 
            isSaving={isSaving}
        />

        <MasterSection 
            title="特定成分" 
            items={localData.specificIngredients} 
            onAdd={(v) => addItem('specificIngredients', v)} 
            onRemove={(v) => removeItem('specificIngredients', v)} 
            isSaving={isSaving}
        />
    </div>
  );
};

const MasterSection = ({ title, items, onAdd, onRemove, isSaving }: { title: string, items: string[], onAdd: (v: string) => Promise<void>, onRemove: (v: string) => Promise<void>, isSaving: boolean }) => {
    const [input, setInput] = useState('');
    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-lg mb-4">{title}</h3>
            <div className="flex flex-wrap gap-2 mb-4">
                {items.map(item => (
                    <span key={item} className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-slate-700 text-sm">
                        {item}
                        <button onClick={() => onRemove(item)} className="hover:text-danger"><X size={14} /></button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2 max-w-md">
                <input 
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
                    placeholder="新しい項目を追加"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <button 
                    onClick={async () => {
                      try {
                        await onAdd(input);
                        setInput('');
                      } catch (error) {
                        console.error('Failed to add master item:', error);
                      }
                    }}
                    disabled={isSaving}
                    className="bg-secondary text-white px-4 py-2 rounded-lg hover:bg-slate-600 flex items-center gap-1"
                >
                    <Plus size={16} /> {isSaving ? '保存中...' : '追加'}
                </button>
            </div>
        </div>
    );
};
