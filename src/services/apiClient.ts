type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const rawBase = import.meta.env.VITE_API_BASE ?? '';
const baseUrl = rawBase.replace(/\/$/, '');

const buildUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${baseUrl}${path}`;
};

const fallbackErrorMessageByStatus = (status: number): string => {
  if (status === 400) return '入力内容を確認してください。';
  if (status === 401) return 'ログインが必要です。再ログインしてください。';
  if (status === 403) return 'この操作を行う権限がありません。';
  if (status === 404) return '対象データが見つかりません。';
  if (status >= 500) return 'サーバーエラーが発生しました。時間をおいて再試行してください。';
  return '処理に失敗しました。時間をおいて再試行してください。';
};

const parseErrorMessage = (status: number, raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return fallbackErrorMessageByStatus(status);

  const normalizeKnownMessage = (message: string): string => {
    const normalized = message.trim();
    const lower = normalized.toLowerCase();

    if (lower === 'unauthorized') {
      return 'セッションの有効期限が切れました。再ログインしてから、もう一度保存してください。';
    }

    const exactMap: Record<string, string> = {
      'Method not allowed': 'この操作は現在利用できません。',
      'User not found': '対象のアカウントが見つかりません。',
      'User id is required': 'アカウントIDが不足しています。画面を再読み込みして再試行してください。',
      'user is required': '保存データが不足しています。入力内容を確認して再試行してください。',
      'Only admin can update master data': 'マスタを更新できるのは管理者のみです。',
      'data is required': '保存データが不足しています。入力内容を確認して再試行してください。',
      'Sheet id is required': 'シートIDが不足しています。画面を再読み込みして再試行してください。',
      'sheet is required': 'シート情報が不足しています。入力内容を確認して再試行してください。',
      'At least one product is required': '商品を1件以上入力してください。',
      'You can only save sheets in your manufacturer': '自社メーカーのシートのみ保存できます。',
      'You cannot modify this sheet': 'このシートを編集する権限がありません。',
      'Sheet not found': '対象のシートが見つかりません。',
      'You cannot delete this sheet': 'このシートを削除する権限がありません。',
      'dataUrl and fileName are required': 'アップロード情報が不足しています。もう一度やり直してください。',
      'Blob storage is not configured': '画像保存先の設定が未完了です。管理者に連絡してください。',
      'Bulk update is deprecated. Use /api/users/:id': '一括更新は利用できません。個別更新で実行してください。',
      'Deprecated endpoint. Use /api/sheets.': '古いAPIは利用できません。画面を再読み込みして再試行してください。',
      'Only admin can migrate data': '移行処理を実行できるのは管理者のみです。',
      'Only admin can migrate data to PostgreSQL': 'PostgreSQL移行を実行できるのは管理者のみです。',
      'data with users/sheets/master is required': '移行データが不足しています。users/sheets/masterを確認してください。',
    };

    if (exactMap[normalized]) {
      return exactMap[normalized];
    }

    const retryMatch = normalized.match(/^Too many login attempts\. Retry in (\d+) seconds\.$/);
    if (retryMatch) {
      return `ログイン試行回数が上限に達しました。${retryMatch[1]}秒後に再試行してください。`;
    }

    return normalized;
  };

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return normalizeKnownMessage(parsed.error);
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return normalizeKnownMessage(parsed.message);
    }
  } catch {
    // not JSON
  }

  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    return fallbackErrorMessageByStatus(status);
  }

  return trimmed;
};

const request = async <T>(
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(parseErrorMessage(response.status, errorText));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
