import { EntrySheet, MasterData, User } from '../types';
import { apiClient } from './apiClient';

export interface DataService {
  getUsers: () => Promise<User[]>;
  saveUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  login: (username: string, password?: string) => Promise<User | null>;
  getCurrentUser: () => Promise<User | null>;
  setCurrentUser: (user: User | null) => Promise<void>;
  getSheets: () => Promise<EntrySheet[]>;
  saveSheet: (sheet: EntrySheet) => Promise<void>;
  deleteSheet: (id: string) => Promise<void>;
  getMasterData: () => Promise<MasterData>;
  saveMasterData: (data: MasterData) => Promise<void>;
}

const apiDataService: DataService = {
  getUsers: async () => apiClient.get<User[]>('/api/users'),
  saveUser: async (user) => {
    await apiClient.put<void>(`/api/users/${user.id}`, { user });
  },
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
  saveSheet: async (sheet) => {
    await apiClient.put<void>(`/api/sheets/${sheet.id}`, { sheet });
  },
  deleteSheet: async (id) => {
    await apiClient.delete<void>(`/api/sheets/${id}`);
  },
  getMasterData: async () => apiClient.get<MasterData>('/api/master'),
  saveMasterData: async (data) => {
    await apiClient.put<void>('/api/master', { data });
  },
};

export const isApiDataSource = true;
export const dataService: DataService = apiDataService;
