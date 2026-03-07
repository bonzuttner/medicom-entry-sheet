import React, { useEffect, useMemo, useState } from 'react';
import { EntrySheet, EntrySheetAdminMemo } from '../types';
import { CircleOff, Download, Edit3, ExternalLink, Save, Search } from 'lucide-react';

interface AdminEntryListProps {
  sheets: EntrySheet[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  totalCount?: number;
  onEdit: (sheet: EntrySheet) => void;
  onSaveAdminMemo: (sheetId: string, memo: EntrySheetAdminMemo) => Promise<EntrySheet>;
}

type MemoDraft = {
  version: number;
  promoCode: string;
  deadlineTableUrl: string;
  bandPattern: string;
  targetStoreCount: string;
  printBoard1Count: string;
  printBoard2Count: string;
  printBand1Count: string;
  printBand2Count: string;
  adminNote: string;
};

const toNumericDraftValue = (value: string | number | null | undefined): string => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(Math.floor(value));
  if (typeof value === 'string') {
    const matched = value.trim().match(/^\d+$/) || value.trim().match(/(\d+)/);
    return matched?.[1] || matched?.[0] || '';
  }
  return '';
};

const buildDraftFromSheet = (sheet: EntrySheet): MemoDraft => ({
  version: sheet.adminMemo?.version || 1,
  promoCode: sheet.adminMemo?.promoCode || '',
  deadlineTableUrl: sheet.adminMemo?.deadlineTableUrl || '',
  bandPattern: toNumericDraftValue(sheet.adminMemo?.bandPattern),
  targetStoreCount: toNumericDraftValue(sheet.adminMemo?.targetStoreCount),
  printBoard1Count: toNumericDraftValue(sheet.adminMemo?.printBoard1Count),
  printBoard2Count: toNumericDraftValue(sheet.adminMemo?.printBoard2Count),
  printBand1Count: toNumericDraftValue(sheet.adminMemo?.printBand1Count),
  printBand2Count: toNumericDraftValue(sheet.adminMemo?.printBand2Count),
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
const normalizeSheetStatus = (
  status: EntrySheet['status'] | string
): 'completed' | 'completed_no_image' | 'draft' => {
  if (status === 'completed') return 'completed';
  if (status === 'completed_no_image') return 'completed_no_image';
  return 'draft';
};
const getStatusLabel = (status: EntrySheet['status'] | string): string => {
  const normalized = normalizeSheetStatus(status);
  if (normalized === 'completed') return '完了';
  if (normalized === 'completed_no_image') return '完了 -商品画像なし';
  return '下書き';
};
const getStatusPillClass = (status: EntrySheet['status'] | string): string => {
  const normalized = normalizeSheetStatus(status);
  if (normalized === 'completed') return 'bg-green-100 text-green-800';
  if (normalized === 'completed_no_image') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

export const AdminEntryList: React.FC<AdminEntryListProps> = ({
  sheets,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  totalCount = 0,
  onEdit,
  onSaveAdminMemo,
}) => {
  const [keyword, setKeyword] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [drafts, setDrafts] = useState<Record<string, MemoDraft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [expandedMobileRows, setExpandedMobileRows] = useState<Record<string, boolean>>({});

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
  const loadedCount = sheets.length;
  const safeTotalCount = totalCount > 0 ? totalCount : loadedCount;
  const remainingCount = Math.max(safeTotalCount - loadedCount, 0);
  const remainingPages = Math.ceil(remainingCount / 30);
  const setDraftValue = (sheetId: string, field: keyof MemoDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [sheetId]: {
        ...(prev[sheetId] || {
          version: 1,
          promoCode: '',
          deadlineTableUrl: '',
          bandPattern: '',
          targetStoreCount: '',
          printBoard1Count: '',
          printBoard2Count: '',
          printBand1Count: '',
          printBand2Count: '',
          adminNote: '',
        }),
        [field]: value,
      },
    }));
  };

  const toOptionalInteger = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.floor(parsed);
  };

  const isDraftDirty = (sheet: EntrySheet): boolean => {
    const current = drafts[sheet.id] || buildDraftFromSheet(sheet);
    const initial = buildDraftFromSheet(sheet);
    return JSON.stringify(current) !== JSON.stringify(initial);
  };

  const handleSave = async (sheetId: string) => {
    const targetSheet = sheets.find((sheet) => sheet.id === sheetId);
    if (targetSheet && !isDraftDirty(targetSheet)) {
      return;
    }

    const draft = drafts[sheetId] || {
      version: 1,
      promoCode: '',
      deadlineTableUrl: '',
      bandPattern: '',
      targetStoreCount: '',
      printBoard1Count: '',
      printBoard2Count: '',
      printBand1Count: '',
      printBand2Count: '',
      adminNote: '',
    };
    const memo: EntrySheetAdminMemo = {
      version: draft.version,
      promoCode: draft.promoCode.trim() || undefined,
      deadlineTableUrl: draft.deadlineTableUrl.trim() || undefined,
      bandPattern: draft.bandPattern.trim() || undefined,
      targetStoreCount: toOptionalInteger(draft.targetStoreCount),
      printBoard1Count: toOptionalInteger(draft.printBoard1Count),
      printBoard2Count: toOptionalInteger(draft.printBoard2Count),
      printBand1Count: toOptionalInteger(draft.printBand1Count),
      printBand2Count: toOptionalInteger(draft.printBand2Count),
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
      [
        'シートID',
        '状態',
        'タイトル',
        '展開期間',
        '棚割名',
        'メーカー名',
        '販促CD',
        'ボードピッキングJAN',
        '期限表URL',
        '帯パターン',
        '対象店舗数',
        '印刷依頼数量 ボード①',
        '印刷依頼数量 ボード②',
        '印刷依頼数量 帯①',
        '印刷依頼数量 帯②',
        '印刷依頼数量 その他',
        '備品',
        '備考',
      ],
    ];

    filteredSheets.forEach((sheet) => {
      const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
      const memo = sheet.adminMemo;
      rows.push([
        toSafeCsvCell(sheet.id),
        toSafeCsvCell(sheet.status),
        toSafeCsvCell(sheet.title),
        toSafeCsvCell(getDeploymentPeriodLabel(sheet)),
        toSafeCsvCell(getShelfNames(sheet)),
        toSafeCsvCell(sheet.manufacturerName),
        toSafeCsvCell(draft.promoCode),
        toSafeCsvCell(memo?.boardPickingJan || ''),
        toSafeCsvCell(draft.deadlineTableUrl),
        toSafeCsvCell(draft.bandPattern),
        toSafeCsvCell(draft.targetStoreCount),
        toSafeCsvCell(draft.printBoard1Count),
        toSafeCsvCell(draft.printBoard2Count),
        toSafeCsvCell(draft.printBand1Count),
        toSafeCsvCell(draft.printBand2Count),
        toSafeCsvCell(memo?.printOther || ''),
        toSafeCsvCell(memo?.equipmentNote || ''),
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
        <table className="min-w-[1280px] w-full divide-y divide-slate-200 table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-[90px] px-3 py-3 text-left text-xs font-bold text-slate-500">状態</th>
              <th className="w-[300px] px-3 py-3 text-left text-xs font-bold text-slate-500">タイトル</th>
              <th className="w-[120px] px-3 py-3 text-left text-xs font-bold text-slate-500">展開期間</th>
              <th className="w-[150px] px-3 py-3 text-left text-xs font-bold text-slate-500">棚割り</th>
              <th className="w-[140px] px-3 py-3 text-left text-xs font-bold text-slate-500">メーカー名</th>
              <th className="w-[72px] px-3 py-3 text-center text-xs font-bold text-slate-500">期限表</th>
              <th className="w-[120px] px-3 py-3 text-left text-xs font-bold text-slate-500">販促CD</th>
              <th className="w-[120px] px-3 py-3 text-left text-xs font-bold text-slate-500">帯パターン</th>
              <th className="w-[110px] px-3 py-3 text-left text-xs font-bold text-slate-500">対象店舗数</th>
              <th className="hidden md:table-cell w-[260px] px-3 py-3 text-left text-xs font-bold text-slate-500">印刷依頼数量</th>
              <th className="w-[145px] px-3 py-3 text-right text-xs font-bold text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSheets.map((sheet) => {
              const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
              const urlEnabled = isHttpUrl(draft.deadlineTableUrl);
              const dirty = isDraftDirty(sheet);
              return (
                <React.Fragment key={sheet.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-3 py-3 text-xs text-slate-700">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getStatusPillClass(sheet.status)}`}
                      >
                        {getStatusLabel(sheet.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onEdit(sheet)}
                        className="text-left text-sm font-semibold text-slate-800 break-words leading-5 hover:text-primary"
                        title="エントリーシート編集を開く"
                      >
                        {sheet.title}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {getDeploymentPeriodLabel(sheet)}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700">
                      <div className="truncate" title={getShelfNames(sheet)}>
                        {getShelfNames(sheet)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700 whitespace-nowrap">{sheet.manufacturerName}</td>
                    <td className="px-3 py-3 text-center">
                      {urlEnabled ? (
                        <a
                          href={draft.deadlineTableUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-primary hover:bg-sky-50 hover:text-sky-700"
                          title="期限表を開く"
                        >
                          <ExternalLink size={15} />
                        </a>
                      ) : (
                        <span
                          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-300 bg-slate-100"
                          title="未設定"
                        >
                          <CircleOff size={15} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={draft.promoCode}
                        onChange={(e) => setDraftValue(sheet.id, 'promoCode', e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
                        placeholder="X000000"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="number"
                          min={0}
                          value={draft.bandPattern}
                          onChange={(e) => setDraftValue(sheet.id, 'bandPattern', e.target.value)}
                          className="w-16 border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white text-right"
                        />
                        <span className="text-slate-500">種</span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="number"
                          min={0}
                          value={draft.targetStoreCount}
                          onChange={(e) => setDraftValue(sheet.id, 'targetStoreCount', e.target.value)}
                          className="w-16 border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white text-right"
                        />
                        <span className="text-slate-500">店舗</span>
                      </label>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                          <span className="text-slate-500 whitespace-nowrap">ボード①</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.printBoard1Count}
                            onChange={(e) => setDraftValue(sheet.id, 'printBoard1Count', e.target.value)}
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                          />
                          <span className="text-slate-500">枚</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                          <span className="text-slate-500 whitespace-nowrap">ボード②</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.printBoard2Count}
                            onChange={(e) => setDraftValue(sheet.id, 'printBoard2Count', e.target.value)}
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                          />
                          <span className="text-slate-500">枚</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                          <span className="text-slate-500 whitespace-nowrap">帯①</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.printBand1Count}
                            onChange={(e) => setDraftValue(sheet.id, 'printBand1Count', e.target.value)}
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                          />
                          <span className="text-slate-500">枚</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                          <span className="text-slate-500 whitespace-nowrap">帯②</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.printBand2Count}
                            onChange={(e) => setDraftValue(sheet.id, 'printBand2Count', e.target.value)}
                            className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                          />
                          <span className="text-slate-500">枚</span>
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMobileRows((prev) => ({ ...prev, [sheet.id]: !prev[sheet.id] }))
                          }
                          className="md:hidden inline-flex items-center px-2 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold"
                        >
                          詳細編集
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(sheet)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                          title="編集"
                        >
                          <Edit3 size={13} />
                          編集
                        </button>
                        <button
                          onClick={() => {
                            void handleSave(sheet.id);
                          }}
                          disabled={Boolean(savingById[sheet.id]) || !dirty}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-60 ${
                            dirty
                              ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          <Save size={14} />
                          {savingById[sheet.id] ? '保存中' : '保存'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedMobileRows[sheet.id] && (
                    <tr className="md:hidden bg-slate-50/70">
                      <td colSpan={11} className="px-3 pb-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] font-semibold text-slate-500 mb-2">印刷依頼数量</div>
                          <div className="grid grid-cols-1 gap-2">
                            <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                              <span className="w-14 text-slate-500">ボード①</span>
                              <input
                                type="number"
                                min={0}
                                value={draft.printBoard1Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBoard1Count', e.target.value)}
                                className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                              />
                              <span className="text-slate-500">枚</span>
                            </label>
                            <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                              <span className="w-14 text-slate-500">ボード②</span>
                              <input
                                type="number"
                                min={0}
                                value={draft.printBoard2Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBoard2Count', e.target.value)}
                                className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                              />
                              <span className="text-slate-500">枚</span>
                            </label>
                            <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                              <span className="w-14 text-slate-500">帯①</span>
                              <input
                                type="number"
                                min={0}
                                value={draft.printBand1Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBand1Count', e.target.value)}
                                className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                              />
                              <span className="text-slate-500">枚</span>
                            </label>
                            <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                              <span className="w-14 text-slate-500">帯②</span>
                              <input
                                type="number"
                                min={0}
                                value={draft.printBand2Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBand2Count', e.target.value)}
                                className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-right"
                              />
                              <span className="text-slate-500">枚</span>
                            </label>
                          </div>
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
      {hasMore && (
        <div className="text-center pt-2 space-y-2">
          <div className="text-xs text-slate-500">
            表示: {loadedCount} / 全{safeTotalCount}件
            {remainingCount > 0 ? `（残り ${remainingCount}件 / 約${remainingPages}ページ）` : ''}
          </div>
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
