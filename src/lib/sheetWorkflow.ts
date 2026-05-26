import { EntrySheet, EntryStatus } from '../types';

export type WorkflowStatusKey =
  | 'draft'
  | 'entry_completed'
  | 'entry_completed_no_image'
  | 'revision_requested'
  | 'approved';

export interface WorkflowStatusView {
  key: WorkflowStatusKey;
  label: string;
  pillClassName: string;
}

const resolveEntryStatus = (sheet: Pick<EntrySheet, 'status' | 'entryStatus'>): EntryStatus =>
  sheet.entryStatus || sheet.status || 'draft';

export const getWorkflowStatusView = (
  sheet: Pick<EntrySheet, 'status' | 'entryStatus'>
): WorkflowStatusView => {
  const entryStatus = resolveEntryStatus(sheet);

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
  if (entryStatus === 'revision_requested') {
    return {
      key: 'revision_requested',
      label: '修正依頼',
      pillClassName: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200',
    };
  }
  if (entryStatus === 'approved') {
    return {
      key: 'approved',
      label: '承認',
      pillClassName: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
    };
  }
  return {
    key: 'draft',
    label: '下書き',
    pillClassName: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  };
};
