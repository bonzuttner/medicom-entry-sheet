import { EntrySheet } from './types';

const HISTORY_RETENTION_YEARS = 3;

const getRetentionCutoff = (): Date => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - HISTORY_RETENTION_YEARS);
  return cutoff;
};

const getSheetBaseDate = (sheet: EntrySheet): Date | null => {
  const base = sheet.createdAt || sheet.updatedAt;
  if (!base) return null;
  const parsed = new Date(base);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const pruneSheetsByRetention = (sheets: EntrySheet[]): EntrySheet[] => {
  const cutoff = getRetentionCutoff();
  return sheets.filter((sheet) => {
    const baseDate = getSheetBaseDate(sheet);
    if (!baseDate) return true;
    return baseDate >= cutoff;
  });
};
