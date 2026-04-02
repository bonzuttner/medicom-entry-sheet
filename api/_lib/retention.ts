const SHEET_RETENTION_YEARS = 2;
const MANUFACTURER_PRODUCT_RETENTION_YEARS = 2;
const CREATIVE_RETENTION_YEARS = 2;
const RETENTION_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastRetentionRunAt = 0;

const yearsAgo = (years: number): Date => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  return cutoff;
};

export const getSheetRetentionCutoff = (): Date => yearsAgo(SHEET_RETENTION_YEARS);

export const getManufacturerProductRetentionCutoff = (): Date =>
  yearsAgo(MANUFACTURER_PRODUCT_RETENTION_YEARS);

export const getCreativeRetentionCutoff = (): Date => yearsAgo(CREATIVE_RETENTION_YEARS);

export const shouldRunRetention = (): boolean =>
  Date.now() - lastRetentionRunAt >= RETENTION_RUN_INTERVAL_MS;

export const markRetentionRun = (): void => {
  lastRetentionRunAt = Date.now();
};

export const getRetentionConfig = () => ({
  sheetRetentionYears: SHEET_RETENTION_YEARS,
  manufacturerProductRetentionYears: MANUFACTURER_PRODUCT_RETENTION_YEARS,
  creativeRetentionYears: CREATIVE_RETENTION_YEARS,
  runIntervalMs: RETENTION_RUN_INTERVAL_MS,
});
