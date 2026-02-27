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
    const normalized = message.trim().toLowerCase();
    if (normalized === 'unauthorized') {
      return 'セッションの有効期限が切れました。再ログインしてから、もう一度保存してください。';
    }
    return message.trim();
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
