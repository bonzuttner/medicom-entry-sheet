import React, { useEffect, useMemo, useState } from 'react';
import { EntrySheet, EntrySheetAdminMemo } from '../types';
import { CheckSquare, CircleOff, Download, Edit3, ExternalLink, Save, Search, Square, X } from 'lucide-react';
import { getCurrentAssigneeLabel, getWorkflowStatusView } from '../lib/sheetWorkflow';

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
  boardPickingJan: string;
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

const normalizeToHalfWidth = (value: string): string => value.normalize('NFKC');
const normalizeDigitsInput = (value: string): string =>
  normalizeToHalfWidth(value).replace(/[^0-9]/g, '');
const NUMERIC_DRAFT_FIELDS: ReadonlySet<keyof MemoDraft> = new Set([
  'bandPattern',
  'targetStoreCount',
  'printBoard1Count',
  'printBoard2Count',
  'printBand1Count',
  'printBand2Count',
]);

const buildDraftFromSheet = (sheet: EntrySheet): MemoDraft => ({
  version: sheet.adminMemo?.version || 1,
  promoCode: sheet.adminMemo?.promoCode || '',
  boardPickingJan: toNumericDraftValue(sheet.adminMemo?.boardPickingJan),
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

const getDeploymentPeriodLabel = (sheet: EntrySheet): string => {
  const period = getDeploymentPeriod(sheet);
  if (!period.start || !period.end) return '未設定';
  return `${period.start}~${period.end}`;
};

const getShelfNames = (sheet: EntrySheet): string => sheet.shelfName?.trim() || '未設定';

const isHttpUrl = (value: string): boolean => /^https?:\/\/.+/i.test(value.trim());
export const AdminEntryList: React.FC<AdminEntryListProps> = ({
  sheets,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  totalCount = 0,
  onEdit,
  onSaveAdminMemo,
}) => {
  const pageTitleClass = 'text-2xl font-bold tracking-tight text-slate-800';
  const toolbarAccentButtonClass =
    'flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 font-semibold text-sky-700 shadow-sm transition-all hover:bg-sky-100';
  const searchInputClass =
    'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';
  const filterControlClass =
    'rounded-md border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700';
  const getLegacyShortSheetId = (id: string): string => id.slice(0, 8);
  const getDisplaySheetId = (sheet: EntrySheet): string =>
    sheet.sheetCode?.trim() || getLegacyShortSheetId(sheet.id);
  const [keyword, setKeyword] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [deploymentDate, setDeploymentDate] = useState('');
  const [deploymentFilterMode, setDeploymentFilterMode] = useState<'since' | 'until'>('since');
  const [drafts, setDrafts] = useState<Record<string, MemoDraft>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);

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
        const matchedKeyword = (
          sheet.title.toLowerCase().includes(q) ||
          sheet.manufacturerName.toLowerCase().includes(q) ||
          shelfText.includes(q)
        );
        return matchedKeyword;
      })
      .filter((sheet) => {
        if (!deploymentDate) return true;
        const period = getDeploymentPeriod(sheet);
        if (!period.start || !period.end) return false;
        const [startYear, startMonth] = period.start.split('/').map((v) => Number(v));
        const [endYear, endMonth] = period.end.split('/').map((v) => Number(v));
        if (!startYear || !startMonth || !endYear || !endMonth) return false;

        const startTs = new Date(startYear, startMonth - 1, 1).getTime();
        const endTs = new Date(endYear, endMonth, 0, 23, 59, 59, 999).getTime();
        const targetStart = new Date(`${deploymentDate}T00:00:00`).getTime();
        const targetEnd = new Date(`${deploymentDate}T23:59:59.999`).getTime();
        if (deploymentFilterMode === 'since') {
          return endTs >= targetStart;
        }
        return startTs <= targetEnd;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sheets, keyword, manufacturerFilter, deploymentDate, deploymentFilterMode]);
  const loadedCount = sheets.length;
  const safeTotalCount = totalCount > 0 ? totalCount : loadedCount;
  const remainingCount = Math.max(safeTotalCount - loadedCount, 0);
  const remainingPages = Math.ceil(remainingCount / 30);

  const toggleSelect = (sheetId: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) {
        next.delete(sheetId);
      } else {
        next.add(sheetId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredSheets.length === 0) return;
    setSelectedSheets((prev) => {
      const allSelected = filteredSheets.every((sheet) => prev.has(sheet.id));
      if (allSelected) return new Set();
      return new Set(filteredSheets.map((sheet) => sheet.id));
    });
  };

  const selectedCount = filteredSheets.filter((sheet) => selectedSheets.has(sheet.id)).length;
  const setDraftValue = (sheetId: string, field: keyof MemoDraft, value: string) => {
    const normalizedValue =
      field === 'promoCode'
        ? normalizeToHalfWidth(value).toUpperCase()
        : field === 'boardPickingJan'
          ? normalizeDigitsInput(value)
        : NUMERIC_DRAFT_FIELDS.has(field)
          ? normalizeDigitsInput(value)
          : value;
    setDrafts((prev) => ({
      ...prev,
      [sheetId]: {
        ...(prev[sheetId] || {
          version: 1,
          promoCode: '',
          boardPickingJan: '',
          deadlineTableUrl: '',
          bandPattern: '',
          targetStoreCount: '',
          printBoard1Count: '',
          printBoard2Count: '',
          printBand1Count: '',
          printBand2Count: '',
          adminNote: '',
        }),
        [field]: normalizedValue,
      },
    }));
  };

  const toOptionalInteger = (raw: string): number | undefined => {
    const trimmed = normalizeToHalfWidth(raw).trim();
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
      boardPickingJan: '',
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
      boardPickingJan: draft.boardPickingJan.trim() || undefined,
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

  const exportAdminCsv = (targetSheets: EntrySheet[]) => {
    if (targetSheets.length === 0) {
      alert('CSV出力対象がありません。');
      return;
    }
    const rows: string[][] = [
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
        '展開期間',
        '棚割名',
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

    targetSheets.forEach((sheet) => {
      const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
      const memo = sheet.adminMemo;
      const deploymentPeriod = getDeploymentPeriod(sheet);
      const sheetAttachmentNames = (sheet.attachments || []).map((file) => file.name).join(' / ');
      const sheetAttachmentUrls = (sheet.attachments || []).map((file) => file.url).join(' / ');
      rows.push([
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
        toSafeCsvCell(getDeploymentPeriodLabel(sheet)),
        toSafeCsvCell(getShelfNames(sheet)),
        toSafeCsvCell(draft.promoCode),
        toSafeCsvCell(draft.boardPickingJan),
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
    setShowExportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className={pageTitleClass}>エントリー履歴（Admin）</h2>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className={toolbarAccentButtonClass}
        >
          <Download size={18} />
          Admin CSV出力
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative w-full">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={searchInputClass}
            placeholder="シート名、メーカー名、棚割名で検索..."
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600 shrink-0">絞り込み</span>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 flex-1">
            <select
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
              className={`${filterControlClass} min-w-[132px]`}
            >
              <option value="">メーカー</option>
              {manufacturerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="hidden sm:inline-flex items-center text-[11px] font-bold text-slate-600">展開期間</span>
            <select
              value={deploymentFilterMode}
              onChange={(e) => setDeploymentFilterMode(e.target.value as 'since' | 'until')}
              className={filterControlClass}
            >
              <option value="since">以降</option>
              <option value="until">以前</option>
            </select>
            <input
              type="date"
              value={deploymentDate}
              onChange={(e) => setDeploymentDate(e.target.value)}
              className={`${filterControlClass} col-span-2 sm:col-span-1`}
            />
            {deploymentDate && (
              <button
                onClick={() => setDeploymentDate('')}
                className="px-2 py-2 rounded-md border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 col-span-2 sm:col-span-1 sm:w-auto"
              >
                解除
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <table className="min-w-[1480px] w-full table-fixed border-separate border-spacing-0">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 top-0 z-50 w-[52px] border-b border-slate-200 px-2 py-3 text-center text-xs font-bold text-slate-500 bg-slate-50 shadow-[1px_0_0_0_rgba(226,232,240,1)]">
                <button onClick={toggleSelectAll} className="inline-flex items-center justify-center text-slate-500 hover:text-slate-700">
                  {filteredSheets.length > 0 && selectedCount === filteredSheets.length ? (
                    <CheckSquare size={15} />
                  ) : (
                    <Square size={15} />
                  )}
                </button>
              </th>
              <th className="sticky top-0 z-10 w-24 border-b border-slate-200 px-2 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">ID</th>
              <th className="sticky top-0 z-10 w-[168px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">状態</th>
              <th className="sticky top-0 z-10 w-[360px] border-b border-slate-200 bg-slate-50 px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">タイトル</th>
              <th className="sticky top-0 z-10 w-[104px] border-b border-slate-200 bg-slate-50 px-2 py-3 text-left text-xs font-bold text-slate-500">展開期間</th>
              <th className="sticky top-0 z-10 w-[110px] border-b border-slate-200 bg-slate-50 px-2 py-3 text-left text-xs font-bold text-slate-500">棚割り</th>
              <th className="sticky top-0 z-10 w-[116px] border-b border-slate-200 bg-slate-50 px-2 py-3 text-left text-xs font-bold text-slate-500">メーカー名</th>
              <th className="sticky top-0 z-10 w-[72px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs font-bold text-slate-500">期限表</th>
              <th className="sticky top-0 z-10 w-[120px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">販促CD</th>
              <th className="sticky top-0 z-10 w-[150px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">ボードピッキングJAN</th>
              <th className="sticky top-0 z-10 w-[120px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">帯パターン</th>
              <th className="sticky top-0 z-10 w-[110px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">対象店舗数</th>
              <th className="sticky top-0 z-10 hidden md:table-cell w-[260px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">印刷依頼数量</th>
              <th className="sticky top-0 z-10 w-[100px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-500">保存</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredSheets.map((sheet) => {
              const draft = drafts[sheet.id] || buildDraftFromSheet(sheet);
              const urlEnabled = isHttpUrl(draft.deadlineTableUrl);
              const dirty = isDraftDirty(sheet);
              const workflowStatus = getWorkflowStatusView(sheet);
              const assigneeLabel = getCurrentAssigneeLabel(sheet.currentAssignee);
              return (
                <React.Fragment key={sheet.id}>
                  <tr className={`${dirty ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'}`}>
                    <td className="sticky left-0 z-30 w-[52px] px-2 py-3 text-center bg-white shadow-[1px_0_0_0_rgba(241,245,249,1)]">
                      <button
                        type="button"
                        onClick={() => toggleSelect(sheet.id)}
                        className="inline-flex items-center justify-center text-slate-500 hover:text-slate-700"
                        title="CSV出力対象として選択"
                      >
                        {selectedSheets.has(sheet.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    </td>
                    <td className="w-24 px-2 py-4 text-[10px] text-slate-400 font-mono whitespace-nowrap bg-white">
                      <div className="flex items-center gap-2">
                        <span>{getDisplaySheetId(sheet)}</span>
                        <button
                          type="button"
                          onClick={() => onEdit(sheet)}
                          className="inline-flex items-center justify-center rounded p-1 text-primary hover:bg-sky-100 hover:text-sky-700 transition-colors"
                          title="詳細編集"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="space-y-1">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${workflowStatus.pillClassName}`}>
                          {workflowStatus.label}
                        </span>
                        <div className="text-[11px] text-slate-500">担当: {assigneeLabel}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 break-words leading-tight line-clamp-2">{sheet.title}</div>
                      <div className="text-xs text-slate-500">{sheet.products.length} 商品登録済</div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {getDeploymentPeriodLabel(sheet)}
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-700">
                      <div className="truncate" title={getShelfNames(sheet)}>
                        {getShelfNames(sheet)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-700 whitespace-nowrap">{sheet.manufacturerName}</td>
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
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                        placeholder="X000000"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={draft.boardPickingJan}
                        onChange={(e) => setDraftValue(sheet.id, 'boardPickingJan', e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                        placeholder="9999999999999"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={draft.bandPattern}
                          onChange={(e) => setDraftValue(sheet.id, 'bandPattern', e.target.value)}
                          className="w-14 border border-slate-300 rounded-md px-1.5 py-1 text-xs bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                        />
                        <span className="text-slate-500">種</span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={draft.targetStoreCount}
                          onChange={(e) => setDraftValue(sheet.id, 'targetStoreCount', e.target.value)}
                          className="w-14 border border-slate-300 rounded-md px-1.5 py-1 text-xs bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                        />
                        <span className="text-slate-500">店舗</span>
                      </label>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <div className="rounded-lg bg-white p-2 shadow-[inset_0_1px_0_0_rgba(148,163,184,0.06)]">
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="flex items-center justify-between gap-1 rounded-md bg-white px-1.5 py-1">
                            <span className="text-[10px] text-slate-500">ボード①</span>
                            <span className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.printBoard1Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBoard1Count', e.target.value)}
                                className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                              />
                              <span className="text-[10px] text-slate-400">枚</span>
                            </span>
                          </label>
                          <label className="flex items-center justify-between gap-1 rounded-md bg-white px-1.5 py-1">
                            <span className="text-[10px] text-slate-500">ボード②</span>
                            <span className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.printBoard2Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBoard2Count', e.target.value)}
                                className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                              />
                              <span className="text-[10px] text-slate-400">枚</span>
                            </span>
                          </label>
                          <label className="flex items-center justify-between gap-1 rounded-md bg-white px-1.5 py-1">
                            <span className="text-[10px] text-slate-500">帯①</span>
                            <span className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.printBand1Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBand1Count', e.target.value)}
                                className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                              />
                              <span className="text-[10px] text-slate-400">枚</span>
                            </span>
                          </label>
                          <label className="flex items-center justify-between gap-1 rounded-md bg-white px-1.5 py-1">
                            <span className="text-[10px] text-slate-500">帯②</span>
                            <span className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draft.printBand2Count}
                                onChange={(e) => setDraftValue(sheet.id, 'printBand2Count', e.target.value)}
                                className="w-12 border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white text-right text-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-colors"
                              />
                              <span className="text-[10px] text-slate-400">枚</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-left">
                      <div className={`inline-flex items-center gap-1.5 rounded-lg p-1 whitespace-nowrap ${dirty ? 'bg-amber-100/70' : 'bg-slate-50'}`}>
                        {dirty && (
                          <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-amber-700">
                            未保存
                          </span>
                        )}
                        <button
                          onClick={() => {
                            void handleSave(sheet.id);
                          }}
                          disabled={Boolean(savingById[sheet.id]) || !dirty}
                          className={`inline-flex items-center justify-center gap-1.5 h-8 min-w-16 px-2.5 rounded-md text-xs font-semibold disabled:opacity-60 transition-colors ${
                            dirty
                              ? 'bg-primary text-white hover:bg-sky-700 shadow-sm'
                              : 'bg-slate-200 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <Save size={14} />
                          {savingById[sheet.id] ? '保存中' : '保存'}
                        </button>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
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
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-slate-800">CSV出力オプション</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={22} />
              </button>
            </div>
            <p className="text-slate-600 mb-5">出力するデータの対象を選択してください。</p>
            <div className="space-y-3">
              <button
                onClick={() => exportAdminCsv(filteredSheets)}
                className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-primary transition-all group"
              >
                <div className="text-left">
                  <div className="font-bold text-slate-800 group-hover:text-primary">表示中のデータをすべて出力</div>
                  <div className="text-sm text-slate-500">フィルター適用後の全データ ({filteredSheets.length}件)</div>
                </div>
                <Download size={18} className="text-slate-400 group-hover:text-primary" />
              </button>
              <button
                onClick={() => exportAdminCsv(filteredSheets.filter((sheet) => selectedSheets.has(sheet.id)))}
                disabled={selectedCount === 0}
                className={`w-full flex items-center justify-between p-4 border rounded-lg transition-all ${
                  selectedCount === 0
                    ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                    : 'border-slate-200 hover:bg-slate-50 hover:border-primary'
                }`}
              >
                <div className="text-left">
                  <div className="font-bold">選択したデータのみ出力</div>
                  <div className="text-sm text-slate-500">{selectedCount}件 選択中</div>
                </div>
                <Download size={18} className={selectedCount === 0 ? 'text-slate-300' : 'text-slate-500'} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
