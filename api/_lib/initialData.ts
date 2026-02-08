import { EntrySheet, MasterData, StoreData, User } from './types';
import { hashPassword } from './password';

const INITIAL_USERS: User[] = [
  {
    id: 'admin1',
    username: 'admin',
    password: hashPassword('password'),
    displayName: 'システム管理者',
    manufacturerName: 'メディコム',
    email: 'admin@medicom.com',
    phoneNumber: '03-0000-0000',
    role: 'ADMIN',
  },
  {
    id: 'user1',
    username: 'satou',
    password: hashPassword('password'),
    displayName: '佐藤 健太',
    manufacturerName: '大江戸製薬',
    email: 'k.satou@oedo-pharma.com',
    phoneNumber: '090-1234-5678',
    role: 'STAFF',
  },
  {
    id: 'user2',
    username: 'tanaka',
    password: hashPassword('password'),
    displayName: '田中 美咲',
    manufacturerName: '富士ファーマ',
    email: 'm.tanaka@fuji-pharma.com',
    phoneNumber: '080-9876-5432',
    role: 'STAFF',
  },
];

const INITIAL_MASTER: MasterData = {
  manufacturerNames: ['メディコム', '大江戸製薬', '富士ファーマ'],
  shelfNames: ['胃腸薬', '風邪薬', '鎮痛剤', 'ビタミン剤', '目薬', '皮膚用薬'],
  riskClassifications: [
    '第1類医薬品',
    '指定第2類医薬品',
    '第2類医薬品',
    '第3類医薬品',
    '医薬部外品',
    '指定医薬部外品',
  ],
  specificIngredients: [
    'イブプロフェン',
    'ロキソプロフェン',
    'コデイン',
    'カフェイン',
    '抗ヒスタミン成分',
    '濫用成分',
  ],
};

const buildInitialSheets = (): EntrySheet[] => {
  const now = new Date().toISOString();
  return [
    {
      id: 'sheet-1',
      updatedAt: now,
      createdAt: now,
      creatorId: 'user1',
      creatorName: '佐藤 健太',
      manufacturerName: '大江戸製薬',
      email: 'k.satou@oedo-pharma.com',
      phoneNumber: '090-1234-5678',
      title: '【テスト】春の売場強化施策',
      status: 'draft',
      products: [
        {
          id: 'prod-1',
          shelfName: '胃腸薬',
          manufacturerName: '大江戸製薬',
          janCode: '4900000000001',
          productName: '大江戸胃腸薬A',
          riskClassification: '第2類医薬品',
          specificIngredients: [],
          catchCopy: '',
          productMessage: '',
          width: 100,
          height: 70,
          depth: 30,
          facingCount: 2,
          hasPromoMaterial: 'no',
        },
      ],
    },
    {
      id: 'sheet-2',
      updatedAt: now,
      createdAt: now,
      creatorId: 'user2',
      creatorName: '田中 美咲',
      manufacturerName: '富士ファーマ',
      email: 'm.tanaka@fuji-pharma.com',
      phoneNumber: '080-9876-5432',
      title: '【テスト】夏季キャンペーン',
      status: 'completed',
      products: [
        {
          id: 'prod-2',
          shelfName: '目薬',
          manufacturerName: '富士ファーマ',
          janCode: '4900000000002',
          productName: 'スッキリ目薬クール',
          riskClassification: '第3類医薬品',
          specificIngredients: [],
          catchCopy: '',
          productMessage: '',
          width: 50,
          height: 90,
          depth: 25,
          facingCount: 3,
          hasPromoMaterial: 'no',
        },
      ],
    },
  ];
};

export const createInitialStoreData = (): StoreData => ({
  users: INITIAL_USERS,
  sheets: buildInitialSheets(),
  master: INITIAL_MASTER,
});
