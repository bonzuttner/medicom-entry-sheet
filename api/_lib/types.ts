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
  riskClassifications: string[];
  specificIngredients: string[];
}

export interface ProductEntry {
  id: string;
  shelfName: string;
  manufacturerName: string;
  janCode: string;
  productName: string;
  productImage?: string;
  riskClassification: string;
  specificIngredients: string[];
  catchCopy: string;
  productMessage: string;
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
  updatedAt: string;
  createdAt: string;
  creatorId: string;
  creatorName: string;
  manufacturerName: string;
  email: string;
  phoneNumber: string;
  title: string;
  notes?: string;
  attachments?: Attachment[];
  status: 'draft' | 'completed';
  products: ProductEntry[];
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
