import { EntrySheet, MasterData, User } from '../types';
import { apiClient } from './apiClient';
import { storage as localStorageService } from './storage';

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

const requestedDataSource = (import.meta.env.VITE_DATA_SOURCE ?? 'local').toLowerCase();
const dataSource = import.meta.env.PROD ? 'api' : requestedDataSource;

const localDataService: DataService = {
  getUsers: async () => localStorageService.getUsers(),
  saveUser: async (user) => {
    const users = localStorageService.getUsers();
    const next = [...users.filter((u) => u.id !== user.id), user];
    localStorageService.saveUsers(next);
  },
  deleteUser: async (id) => {
    const users = localStorageService.getUsers().filter((u) => u.id !== id);
    localStorageService.saveUsers(users);
  },
  login: async (username, password) => localStorageService.login(username, password),
  getCurrentUser: async () => localStorageService.getCurrentUser(),
  setCurrentUser: async (user) => {
    localStorageService.setCurrentUser(user);
  },
  getSheets: async () => localStorageService.getSheets(),
  saveSheet: async (sheet) => {
    localStorageService.saveSheet(sheet);
  },
  deleteSheet: async (id) => {
    localStorageService.deleteSheet(id);
  },
  getMasterData: async () => localStorageService.getMasterData(),
  saveMasterData: async (data) => {
    localStorageService.saveMasterData(data);
  },
};

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

export const isApiDataSource = dataSource === 'api';
export const dataService: DataService = isApiDataSource
  ? apiDataService
  : localDataService;
