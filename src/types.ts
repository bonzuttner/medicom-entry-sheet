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
}

// Product Level Data
export interface ProductEntry {
  id: string;
  shelfName: string; // Master: Pull-down
  manufacturerName: string; // Auto-filled but editable per product if needed
  janCode: string; // 8 or 16 digits
  productName: string;
  productImage?: string; // Mock URL or Base64
  riskClassification: string; // Master: Pull-down
  specificIngredients: string[]; // Master: Multi-select
  catchCopy: string;
  productMessage: string;
  
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
  updatedAt: string; // Auto
  createdAt: string; // Auto
  creatorId: string; // Auto
  creatorName: string; // Auto
  manufacturerName: string; // Auto
  email: string; // Auto (Editable)
  phoneNumber: string; // Auto (Editable)
  title: string;
  status: 'draft' | 'completed';
  products: ProductEntry[];
}

// UI State Types
export enum Page {
  LOGIN = 'LOGIN',
  LIST = 'LIST',
  EDIT = 'EDIT',
  ACCOUNTS = 'ACCOUNTS',
  MASTERS = 'MASTERS',
}
