import React, { useEffect, useMemo, useState } from 'react';
import { EntrySheet, EntrySheetAdminMemo } from '../types';
import { CircleOff, Download, ExternalLink, Save, Search } from 'lucide-react';

interface AdminEntryListProps {
  sheets: EntrySheet[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onSaveAdminMemo: (sheetId: string, memo: EntrySheetAdminMemo) => Promise<EntrySheet>;
}

type MemoDraft = {
  version: number;
  promoCode: string;
  deadlineTableUrl: string;
  targetStoreCount: string;
  adminNote: string;
};

const buildDraftFromSheet = (sheet: EntrySheet): MemoDraft => ({
  version: sheet.adminMemo?.version || 1,
  promoCode: sheet.adminMemo?.promoCode || '',
  deadlineTableUrl: sheet.adminMemo?.deadlineTableUrl || '',
  targetStoreCount:
    sheet.adminMemo?.targetStoreCount === undefined || sheet.adminMemo?.targetStoreCount === null
      ? ''
      : String(sheet.adminMemo.targetStoreCount),
  adminNote: sheet.adminMemo?.adminNote || '',
});

const toSafeCsvCell = (value: unknown): string => {
  const raw = value == null ? '' : String(value);
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const formulaGuarded = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${formulaGuarded.replace(/"/g, '""')}"`;
};

const formatYearMonth = (year: number, month: number): string => `${year}/${month}`;
const getDeploymentPeriod = (sheet: EntrySheet): { start: string; end: string } => {
  if (!sheet.deploymentStartMonth) return { start: '', end: '' };
  const createdAt = new Date(sheet.createdAt);
  if (Number.isNaN(createdAt.getTime())) return { start: '', end: '' };
  const createdMonth = createdAt.getMonth() + 1;
  const monthOffset = (sheet.deploymentStartMonth - createdMonth + 12) % 12;
  const startDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
  startDate.setMonth(startDate.getMonth() + monthOffset);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 2);
  return {
    start: formatYearMonth(startDate.getFullYear(), startDate.getMonth() + 1),
    end: formatYearMonth(endDate.getFullYear(), endDate.getMonth() + 1),
  };
};

const getDeploymentPeriodLabel = (sheet: EntrySheet): string => {
  const period = getDeploymentPeriod(sheet);
  if (!period.start || !period.end) return '未設定';
  return `${period.start}~${period.end}`;
};

const getShelfNames = (sheet: EntrySheet): string =>
  Array.from(
    new Set(
      sheet.products
        .map((product) => (product.shelfName || '').trim())
        .filter((name) => name.length > 0)
    )
  ).join(' / ') || '未設定';

const isHttpUrl = (value: string): boolean => /^https?:\/\/.+/i.test(value.trim());

export const AdminEntryList: React.FC<AdminEntryListProps> = ({
  sheets,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  onSaveAdminMemo,
}) => {
  const [keyword, setKeyword] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, MemoDraft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, MemoDraft> = { ...prev };
      for (const sheet of sheets) {
        if (!next[sheet.id]) {
          next[sheet.id] = buildDraftFromSheet(sheet);
        }
      }
      return next;
    });
  }, [sheets]);

  const manufacturerOptions = useMemo(
    () =>
      Array.from(new Set<string>(sheets.map((sheet) => sheet.manufacturerName))).sort((a, b) =>
        a.localeCompare(b, 'ja')
      ),
    [sheets]
  );

  const filteredSheets = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return sheets
      .filter((sheet) => {
        if (manufacturerFilter && sheet.manufacturerName !== manufacturerFilter) return false;
        if (!q) return true;
        const shelfText = getShelfNames(sheet).toLowerCase();
        return (
          sheet.title.toLowerCase().includes(q) ||
          sheet.manufacturerName.toLowerCase().includes(q) ||
          shelfText.includes(q)
        );
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sheets, keyword, manufacturerFilter]);
  const setDraftValue = (sheetId: string, field: keyof MemoDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [sheetId]: {
        ...(prev[sheetId] || {
          version: 1,
          promoCode: '',
          deadlineTableUrl: '',
          targetStoreCount: '',
          adminNote: '',
        }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (sheetId: string) => {
    const draft = drafts[sheetId] || {
      version: 1,
      promoCode: '',
      deadlineTableUrl: '',
      targetStoreCount: '',
      adminNote: '',
    };
    const targetStoreCount =
      draft.targetStoreCount.trim() === '' ? undefined : Number(draft.targetStoreCount);
    const memo: EntrySheetAdminMemo = {
      version: draft.version,
      promoCode: draft.promoCode.trim() || undefined,
      deadlineTableUrl: draft.deadlineTableUrl.trim() || undefined,
      targetStoreCount:
        targetStoreCount !== undefined && Number.isFinite(targetStoreCount) && targetStoreCount >= 0
          ? Math.floor(targetStoreCount)
          : undefined,
      adminNote: draft.adminNote.trim() || undefined,
    };

    setSavingById((prev) => ({ ...prev, [sheetId]: true }));
    try {
      const savedSheet = await onSaveAdminMemo(sheetId, memo);
      setDrafts((prev) => ({
        ...prev,
        [sheetId]: buildDraftFromSheet(savedSheet),
      }));
    } finally {
      setSavingById((prev) => ({ ...prev, [sheetId]: false }));
    }
  };

  const exportAdminCsv = () => {
    const rows: string[][] = [
      ['シートID', '状態', 'タイトル', '展開期間', '棚割名', 'メーカー名', '販促CD', '期限表URL', '対象店舗数', '備考'],
    ];

    filteredSheets.forEach((sheet) => {
      const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
      rows.push([
        toSafeCsvCell(sheet.id),
        toSafeCsvCell(sheet.status),
        toSafeCsvCell(sheet.title),
        toSafeCsvCell(getDeploymentPeriodLabel(sheet)),
        toSafeCsvCell(getShelfNames(sheet)),
        toSafeCsvCell(sheet.manufacturerName),
        toSafeCsvCell(draft.promoCode),
        toSafeCsvCell(draft.deadlineTableUrl),
        toSafeCsvCell(draft.targetStoreCount),
        toSafeCsvCell(draft.adminNote),
      ]);
    });

    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const csvContent = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin_entry_sheets_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">エントリー履歴（Admin）</h2>
          <p className="text-sm text-slate-500 mt-1">Adminメモを一覧上で編集できます。</p>
        </div>
        <button
          onClick={exportAdminCsv}
          className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-sm"
        >
          <Download size={18} />
          Admin CSV出力
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-sm"
            placeholder="タイトル / メーカー名 / 棚割名で検索"
          />
        </div>
        <select
          value={manufacturerFilter}
          onChange={(e) => setManufacturerFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white min-w-52"
        >
          <option value="">メーカー: すべて</option>
          {manufacturerOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-[1400px] w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">状態</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">タイトル</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">展開期間</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">棚割り</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">メーカー名</th>
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-500">期限表</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">販促CD</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">期限表URL</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">対象店舗数</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500">備考</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500">保存</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSheets.map((sheet) => {
              const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
              const urlEnabled = isHttpUrl(draft.deadlineTableUrl);
              return (
                <tr key={sheet.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-700">{sheet.status}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{sheet.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                    {getDeploymentPeriodLabel(sheet)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{getShelfNames(sheet)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{sheet.manufacturerName}</td>
                  <td className="px-4 py-3 text-center">
                    {urlEnabled ? (
                      <a
                        href={draft.deadlineTableUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-primary hover:text-sky-700"
                        title="期限表を開く"
                      >
                        <ExternalLink size={16} />
                      </a>
                    ) : (
                      <span className="inline-flex text-slate-300" title="未設定">
                        <CircleOff size={16} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={draft.promoCode}
                      onChange={(e) => setDraftValue(sheet.id, 'promoCode', e.target.value)}
                      className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                      placeholder="X000000"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="url"
                      value={draft.deadlineTableUrl}
                      onChange={(e) => setDraftValue(sheet.id, 'deadlineTableUrl', e.target.value)}
                      className="w-80 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                      placeholder="https://..."
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      value={draft.targetStoreCount}
                      onChange={(e) => setDraftValue(sheet.id, 'targetStoreCount', e.target.value)}
                      className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={draft.adminNote}
                      onChange={(e) => setDraftValue(sheet.id, 'adminNote', e.target.value)}
                      className="w-72 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        void handleSave(sheet.id);
                      }}
                      disabled={Boolean(savingById[sheet.id])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <Save size={14} />
                      {savingById[sheet.id] ? '保存中' : '保存'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => onLoadMore?.()}
            disabled={isLoadingMore}
            className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {isLoadingMore ? '読み込み中...' : 'さらに読み込む'}
          </button>
        </div>
      )}
    </div>
  );
};
