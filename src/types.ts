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
  caseNames: string[];
  riskClassifications: string[];
  specificIngredients: string[];
  manufacturerShelfNames?: Record<string, string[]>;
  manufacturerCaseNames?: Record<string, string[]>;
  manufacturerDefaultStartMonths?: Record<string, number[]>;
  manufacturerFaceOptions?: Record<string, FaceOption[]>;
}

export interface FaceOption {
  label: string;
  maxWidth: number;
}

export type EntryStatus = 'draft' | 'completed' | 'completed_no_image';
export type CreativeStatus = 'none' | 'in_progress' | 'confirmation_pending' | 'returned' | 'approved';
export type CurrentAssignee = 'admin' | 'manufacturer_user' | 'none';

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
  sheetCode?: string;
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
  caseName: string;
  notes?: string;
  deploymentStartMonth?: number;
  deploymentEndMonth?: number;
  faceLabel?: string;
  faceMaxWidth?: number;
  attachments?: Attachment[];
  status: EntryStatus;
  entryStatus?: EntryStatus;
  creativeStatus?: CreativeStatus;
  currentAssignee?: CurrentAssignee;
  assigneeUserId?: string;
  assigneeUsername?: string;
  returnReason?: string;
  adminMemo?: EntrySheetAdminMemo;
  creative?: CreativeSummary;
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

export interface CreativeLinkedSheet {
  id: string;
  sheetCode?: string;
  title: string;
  manufacturerName: string;
  shelfName: string;
  caseName: string;
}

export interface CreativeCandidateSheet extends CreativeLinkedSheet {
  updatedAt: string;
  entryStatus?: string;
  status: string;
  creativeStatus?: CreativeStatus;
  linkedCreativeId?: string;
}

export interface CreativeSummary {
  id: string;
  name: string;
  imageUrl: string;
  updatedAt: string;
}

export interface Creative {
  id: string;
  version: number;
  manufacturerName: string;
  creatorId: string;
  creatorName: string;
  name: string;
  imageUrl: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
  linkedSheets: CreativeLinkedSheet[];
}

// UI State Types
export enum Page {
  LOGIN = 'LOGIN',
  LIST = 'LIST',
  ADMIN_LIST = 'ADMIN_LIST',
  EDIT = 'EDIT',
  CREATIVES = 'CREATIVES',
  ACCOUNTS = 'ACCOUNTS',
  MASTERS = 'MASTERS',
}
