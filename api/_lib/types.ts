export type UserRole = 'ADMIN' | 'STAFF';

export interface User {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  manufacturerName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
}

export interface MasterData {
  manufacturerNames: string[];
  shelfNames: string[];
  caseNames: string[];
  riskClassifications: string[];
  specificIngredients: string[];
  manufacturerShelfNames?: Record<string, string[]>;
  manufacturerCaseNames?: Record<string, string[]>;
  manufacturerDefaultStartMonths?: Record<string, number[]>;
}

export interface EntrySheetAdminMemo {
  version?: number;
  promoCode?: string;
  boardPickingJan?: string;
  deadlineTableUrl?: string;
  bandPattern?: string;
  targetStoreCount?: number;
  printBoard1Count?: number;
  printBoard2Count?: number;
  printBand1Count?: number;
  printBand2Count?: number;
  printOther?: string;
  equipmentNote?: string;
  adminNote?: string;
}

export interface ProductEntry {
  id: string;
  manufacturerProductId?: string;
  manufacturerName: string;
  janCode: string;
  productName: string;
  productImage?: string;
  riskClassification: string;
  specificIngredients: string[];
  catchCopy: string;
  productNotes?: string;
  productAttachments?: Attachment[];
  width: number;
  height: number;
  depth: number;
  facingCount: number;
  arrivalDate?: string;
  hasPromoMaterial: 'yes' | 'no';
  promoSample?: string;
  specialFixture?: string;
  promoWidth?: number;
  promoHeight?: number;
  promoDepth?: number;
  promoImage?: string;
}

export interface EntrySheet {
  id: string;
  sheetCode?: string;
  version: number;
  updatedAt: string;
  createdAt: string;
  creatorId: string;
  creatorName: string;
  manufacturerName: string;
  email: string;
  phoneNumber: string;
  shelfName: string;
  title: string;
  caseName: string;
  notes?: string;
  deploymentStartMonth?: number;
  deploymentEndMonth?: number;
  attachments?: Attachment[];
  status: 'draft' | 'completed' | 'completed_no_image';
  adminMemo?: EntrySheetAdminMemo;
  products: ProductEntry[];
}

export interface EntrySheetRevision {
  id: string;
  sheetId: string;
  changedAt: string;
  changedByUserId?: string;
  changedByName: string;
  summary: string;
}

export interface StoreData {
  users: User[];
  sheets: EntrySheet[];
  master: MasterData;
}

export interface Attachment {
  name: string;
  size: number;
  type: string;
  url: string;
  dataUrl?: string;
}
