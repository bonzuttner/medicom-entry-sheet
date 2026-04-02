import { CreativeStatus, CurrentAssignee, EntrySheet, EntryStatus } from '../types';

export type WorkflowStatusKey =
  | 'draft'
  | 'entry_completed'
  | 'entry_completed_no_image'
  | 'creative_in_progress'
  | 'confirmation_pending'
  | 'returned'
  | 'approved';

export interface WorkflowStatusView {
  key: WorkflowStatusKey;
  label: string;
  pillClassName: string;
}

const resolveEntryStatus = (sheet: Pick<EntrySheet, 'status' | 'entryStatus'>): EntryStatus =>
  sheet.entryStatus || sheet.status || 'draft';

const resolveCreativeStatus = (
  sheet: Pick<EntrySheet, 'creativeStatus'>
): CreativeStatus => sheet.creativeStatus || 'none';

export const getWorkflowStatusView = (
  sheet: Pick<EntrySheet, 'status' | 'entryStatus' | 'creativeStatus'>
): WorkflowStatusView => {
  const entryStatus = resolveEntryStatus(sheet);
  const creativeStatus = resolveCreativeStatus(sheet);

  if (creativeStatus === 'approved') {
    return {
      key: 'approved',
      label: '承認済み',
      pillClassName: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    };
  }
  if (creativeStatus === 'returned') {
    return {
      key: 'returned',
      label: '差し戻し',
      pillClassName: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
    };
  }
  if (creativeStatus === 'confirmation_pending') {
    return {
      key: 'confirmation_pending',
      label: '確認待ち',
      pillClassName: 'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
    };
  }
  if (creativeStatus === 'in_progress') {
    return {
      key: 'creative_in_progress',
      label: 'クリエイティブ作成中',
      pillClassName: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
    };
  }
  if (entryStatus === 'completed_no_image') {
    return {
      key: 'entry_completed_no_image',
      label: 'エントリー完了（画像なし）',
      pillClassName: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    };
  }
  if (entryStatus === 'completed') {
    return {
      key: 'entry_completed',
      label: 'エントリー完了',
      pillClassName: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    };
  }
  return {
    key: 'draft',
    label: '下書き',
    pillClassName: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  };
};

export const getCurrentAssigneeLabel = (assignee: CurrentAssignee | undefined): string => {
  if (assignee === 'admin') return 'Admin';
  if (assignee === 'manufacturer_user') return 'メーカー';
  return 'なし';
};
