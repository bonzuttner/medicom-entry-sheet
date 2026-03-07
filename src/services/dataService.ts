import { EntrySheet, EntrySheetRevision, MasterData, ProductEntry, User } from '../types';
import { apiClient } from './apiClient';

export interface PagedResult<T> {
  items: T[];
  hasMore: boolean;
}

export interface DataService {
  getUsers: () => Promise<User[]>;
  saveUser: (user: User) => Promise<User>;
  deleteUser: (id: string) => Promise<void>;
  login: (username: string, password?: string) => Promise<User | null>;
  getCurrentUser: () => Promise<User | null>;
  setCurrentUser: (user: User | null) => Promise<void>;
  getSheets: () => Promise<EntrySheet[]>;
  getSheetsPage: (offset: number, limit: number) => Promise<PagedResult<EntrySheet>>;
  saveSheet: (sheet: EntrySheet, options?: { forceOverwrite?: boolean }) => Promise<EntrySheet>;
  saveSheetAdminMemo: (
    sheetId: string,
    adminMemo: EntrySheet['adminMemo'],
    options?: { forceOverwrite?: boolean }
  ) => Promise<EntrySheet>;
  deleteSheet: (id: string) => Promise<void>;
  getSheetRevisions: (sheetId: string) => Promise<EntrySheetRevision[]>;
  searchProducts: (params: {
    query: string;
    manufacturerName?: string;
    limit?: number;
  }) => Promise<ProductEntry[]>;
  getMasterData: () => Promise<MasterData>;
  saveMasterData: (data: MasterData) => Promise<MasterData>;
}

const apiDataService: DataService = {
  getUsers: async () => apiClient.get<User[]>('/api/users'),
  saveUser: async (user) => apiClient.put<User>(`/api/users/${user.id}`, { user }),
  deleteUser: async (id) => {
    await apiClient.delete<void>(`/api/users/${id}`);
  },
  login: async (username, password) =>
    apiClient.post<User | null>('/api/auth/login', { username, password }),
  getCurrentUser: async () => apiClient.get<User | null>('/api/current-user'),
  setCurrentUser: async (user) => {
    if (!user) {
      await apiClient.delete<void>('/api/current-user');
      return;
    }
    // In API mode, successful login already sets the session cookie.
  },
  getSheets: async () => apiClient.get<EntrySheet[]>('/api/sheets'),
  getSheetsPage: async (offset, limit) =>
    apiClient.get<PagedResult<EntrySheet>>(`/api/sheets?offset=${offset}&limit=${limit}`),
  saveSheet: async (sheet, options) =>
    apiClient
      .put<{ ok: boolean; sheet: EntrySheet }>(`/api/sheets/${sheet.id}`, {
        sheet,
        forceOverwrite: options?.forceOverwrite === true,
      })
      .then((result) => result.sheet),
  saveSheetAdminMemo: async (sheetId, adminMemo, options) =>
    apiClient
      .put<{ ok: boolean; sheet: EntrySheet }>(`/api/sheets/${sheetId}`, {
        mode: 'admin_memo',
        adminMemo,
        forceOverwrite: options?.forceOverwrite === true,
      })
      .then((result) => result.sheet),
  deleteSheet: async (id) => {
    await apiClient.delete<void>(`/api/sheets/${id}`);
  },
  getSheetRevisions: async (sheetId) =>
    apiClient.get<EntrySheetRevision[]>(`/api/sheets/${sheetId}/revisions`),
  searchProducts: async ({ query, manufacturerName, limit = 30 }) =>
    apiClient.get<ProductEntry[]>(
      `/api/products/search?q=${encodeURIComponent(query)}&manufacturerName=${encodeURIComponent(
        manufacturerName || ''
      )}&limit=${limit}`
    ),
  getMasterData: async () => apiClient.get<MasterData>('/api/master'),
  saveMasterData: async (data) => apiClient.put<MasterData>('/api/master', { data }),
};

export const isApiDataSource = true;
export const dataService: DataService = apiDataService;
