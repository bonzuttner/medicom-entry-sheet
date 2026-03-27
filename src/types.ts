export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
}

export interface User {
  id: string;
  username: string; // Login ID
  password?: string; // Simplification for mock
  displayName: string;
  manufacturerName: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
}

export interface MasterData {
  manufacturerNames: string[];
  shelfNames: string[];
  riskClassifications: string[];
  specificIngredients: string[];
  manufacturerShelfNames?: Record<string, string[]>;
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

// Product Level Data
export interface ProductEntry {
  id: string;
  manufacturerProductId?: string;
  manufacturerName: string; // Server-side normalized to sheet manufacturer
  janCode: string; // 8, 13, or 16 digits
  productName: string;
  productImage?: string; // Mock URL or Base64
  riskClassification: string; // Master: Pull-down
  specificIngredients: string[]; // Master: Multi-select
  catchCopy: string;
  productMessage: string;
  productNotes?: string;
  productAttachments?: Attachment[];
  
  // Dimensions
  width: number;
  height: number;
  depth: number;
  facingCount: number;

  // Promotion Info
  arrivalDate?: string;
  hasPromoMaterial: 'yes' | 'no';
  promoSample?: string; // Color/Scent sample
  specialFixture?: string;
  
  // Promo Dimensions (Required if hasPromoMaterial is yes)
  promoWidth?: number;
  promoHeight?: number;
  promoDepth?: number;
  promoImage?: string;
}

// Sheet Level Data (Header)
export interface EntrySheet {
  id: string;
  version: number;
  updatedAt: string; // Auto
  createdAt: string; // Auto
  creatorId: string; // Auto
  creatorName: string; // Auto
  manufacturerName: string; // Auto
  email: string; // Auto (Editable)
  phoneNumber: string; // Auto (Editable)
  shelfName: string;
  title: string;
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

export interface Attachment {
  name: string;
  size: number;
  type: string;
  url: string;
  dataUrl?: string;
}

// UI State Types
export enum Page {
  LOGIN = 'LOGIN',
  LIST = 'LIST',
  ADMIN_LIST = 'ADMIN_LIST',
  EDIT = 'EDIT',
  ACCOUNTS = 'ACCOUNTS',
  MASTERS = 'MASTERS',
}
