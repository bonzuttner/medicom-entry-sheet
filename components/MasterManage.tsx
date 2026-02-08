import React, { useState } from 'react';
import { MasterData } from '../types';
import { Plus, X } from 'lucide-react';

interface MasterManageProps {
  data: MasterData;
  onSave: (data: MasterData) => void;
}

export const MasterManage: React.FC<MasterManageProps> = ({ data, onSave }) => {
  const [localData, setLocalData] = useState<MasterData>(data);

  const addItem = (category: keyof MasterData, value: string) => {
    if(!value) return;
    const newData = { ...localData, [category]: [...localData[category], value] };
    setLocalData(newData);
    onSave(newData); // Auto save for UX
  };

  const removeItem = (category: keyof MasterData, value: string) => {
    if(!window.confirm(`「${value}」を削除しますか？`)) return;
    const newData = { ...localData, [category]: localData[category].filter(v => v !== value) };
    setLocalData(newData);
    onSave(newData);
  };

  return (
    <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-800">マスタ管理</h2>
        <p className="text-slate-500">エントリーシートのプルダウン選択肢を編集します。</p>

        <MasterSection 
            title="棚割名" 
            items={localData.shelfNames} 
            onAdd={(v) => addItem('shelfNames', v)} 
            onRemove={(v) => removeItem('shelfNames', v)} 
        />
        
        <MasterSection 
            title="リスク分類" 
            items={localData.riskClassifications} 
            onAdd={(v) => addItem('riskClassifications', v)} 
            onRemove={(v) => removeItem('riskClassifications', v)} 
        />

        <MasterSection 
            title="特定成分" 
            items={localData.specificIngredients} 
            onAdd={(v) => addItem('specificIngredients', v)} 
            onRemove={(v) => removeItem('specificIngredients', v)} 
        />
    </div>
  );
};

const MasterSection = ({ title, items, onAdd, onRemove }: { title: string, items: string[], onAdd: (v: string) => void, onRemove: (v: string) => void }) => {
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
                    onClick={() => { onAdd(input); setInput(''); }}
                    className="bg-secondary text-white px-4 py-2 rounded-lg hover:bg-slate-600 flex items-center gap-1"
                >
                    <Plus size={16} /> 追加
                </button>
            </div>
        </div>
    );
};
