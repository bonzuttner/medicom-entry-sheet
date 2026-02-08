import { EntrySheet, MasterData, User, UserRole } from '../types';

const KEYS = {
  USERS: 'pharmapop_users',
  SHEETS: 'pharmapop_sheets',
  MASTER: 'pharmapop_master',
  CURRENT_USER: 'pharmapop_current_user',
};

// Initial Data
const INITIAL_USERS: User[] = [
  {
    id: 'admin1',
    username: 'admin',
    password: 'password',
    displayName: 'システム管理者',
    manufacturerName: '本部',
    email: 'admin@pharma.com',
    phoneNumber: '03-0000-0000',
    role: UserRole.ADMIN,
  },
  {
    id: 'user1',
    username: 'satou',
    password: 'password',
    displayName: '佐藤 健太',
    manufacturerName: '大江戸製薬',
    email: 'k.satou@oedo-pharma.com',
    phoneNumber: '090-1234-5678',
    role: UserRole.STAFF,
  },
];

const INITIAL_MASTER: MasterData = {
  shelfNames: ['胃腸薬', '風邪薬', '鎮痛剤', 'ビタミン剤', '目薬', '皮膚用薬'],
  riskClassifications: ['第1類医薬品', '指定第2類医薬品', '第2類医薬品', '第3類医薬品', '医薬部外品', '指定医薬部外品'],
  specificIngredients: ['イブプロフェン', 'ロキソプロフェン', 'コデイン', 'カフェイン', '抗ヒスタミン成分', '濫用成分'],
};

// Test Data Generation
const generateTestSheets = (): EntrySheet[] => {
  const now = new Date().toISOString();
  
  return [
    {
      id: 'test-sheet-1',
      updatedAt: now,
      createdAt: now,
      creatorId: 'user1',
      creatorName: '佐藤 健太',
      manufacturerName: '大江戸製薬',
      email: 'k.satou@oedo-pharma.com',
      phoneNumber: '090-1234-5678',
      title: '【テスト】2025年春季 総合プロモーション',
      status: 'draft',
      products: [
        { shelf: '胃腸薬', name: '大江戸胃腸薬 顆粒' },
        { shelf: '胃腸薬', name: '大江戸胃腸薬 錠剤' },
        { shelf: '風邪薬', name: '大江戸カゼブロック A' },
        { shelf: '風邪薬', name: '大江戸カゼブロック Pro' },
        { shelf: '鎮痛剤', name: '大江戸鎮痛イブ' },
        { shelf: '鎮痛剤', name: '大江戸鎮痛ロキソ' },
        { shelf: 'ビタミン剤', name: 'ビタチャージ 100' },
        { shelf: 'ビタミン剤', name: 'ビタチャージ Gold' },
        { shelf: '目薬', name: 'アイクリア 40' },
        { shelf: '皮膚用薬', name: 'スキンガード クリーム' },
      ].map((item, i) => ({
        id: `prod-test-1-${i}`,
        shelfName: item.shelf,
        manufacturerName: '大江戸製薬',
        janCode: `49000000000${i}`,
        productName: item.name,
        riskClassification: i % 2 === 0 ? '第2類医薬品' : '指定第2類医薬品',
        specificIngredients: i === 4 ? ['イブプロフェン'] : [],
        catchCopy: '今シーズンの主力商品です。',
        productMessage: '視認性の高いパッケージに変更されました。',
        width: 100 + (i * 5),
        height: 80 + (i * 2),
        depth: 30,
        facingCount: 2,
        hasPromoMaterial: 'no',
      }))
    },
    {
      id: 'test-sheet-2',
      updatedAt: now,
      createdAt: now,
      creatorId: 'user1',
      creatorName: '佐藤 健太',
      manufacturerName: '大江戸製薬',
      email: 'k.satou@oedo-pharma.com',
      phoneNumber: '090-1234-5678',
      title: '【テスト】新商品「プレミアム鎮痛Z」導入',
      status: 'draft',
      products: [
        {
          id: 'prod-test-2-1',
          shelfName: '鎮痛剤',
          manufacturerName: '大江戸製薬',
          janCode: '4987000000999',
          productName: 'プレミアム鎮痛Z 24錠',
          riskClassification: '第1類医薬品',
          specificIngredients: ['ロキソプロフェン'],
          catchCopy: '痛みに速攻、胃に優しい',
          productMessage: '薬剤師による説明販売を推奨します。',
          width: 125,
          height: 65,
          depth: 28,
          facingCount: 3,
          hasPromoMaterial: 'yes',
          promoSample: '有り',
          specialFixture: 'カウンター用什器',
          promoWidth: 250,
          promoHeight: 180,
          promoDepth: 100,
          promoImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // Dummy
          productImage: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' // Dummy
        }
      ]
    }
  ];
};

const INITIAL_SHEETS = generateTestSheets();

export const storage = {
  // Users
  getUsers: (): User[] => {
    const data = localStorage.getItem(KEYS.USERS);
    return data ? JSON.parse(data) : INITIAL_USERS;
  },
  saveUsers: (users: User[]) => {
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  },
  
  // Auth
  login: (username: string, password?: string): User | null => {
    const users = storage.getUsers();
    const user = users.find(u => u.username === username);
    if (user && user.password === password) {
      return user;
    }
    return null;
  },
  getCurrentUser: (): User | null => {
    const data = localStorage.getItem(KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  },
  setCurrentUser: (user: User | null) => {
    if (user) {
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
  },

  // Sheets
  getSheets: (): EntrySheet[] => {
    const data = localStorage.getItem(KEYS.SHEETS);
    return data ? JSON.parse(data) : INITIAL_SHEETS;
  },
  saveSheet: (sheet: EntrySheet) => {
    const sheets = storage.getSheets();
    const existingIndex = sheets.findIndex(s => s.id === sheet.id);
    if (existingIndex >= 0) {
      sheets[existingIndex] = sheet;
    } else {
      sheets.push(sheet);
    }
    localStorage.setItem(KEYS.SHEETS, JSON.stringify(sheets));
  },
  deleteSheet: (id: string) => {
    const sheets = storage.getSheets().filter(s => s.id !== id);
    localStorage.setItem(KEYS.SHEETS, JSON.stringify(sheets));
  },

  // Master Data
  getMasterData: (): MasterData => {
    const data = localStorage.getItem(KEYS.MASTER);
    return data ? JSON.parse(data) : INITIAL_MASTER;
  },
  saveMasterData: (data: MasterData) => {
    localStorage.setItem(KEYS.MASTER, JSON.stringify(data));
  },
};