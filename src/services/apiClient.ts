type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const rawBase = import.meta.env.VITE_API_BASE ?? '';
const baseUrl = rawBase.replace(/\/$/, '');

const buildUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${baseUrl}${path}`;
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
    throw new Error(
      `API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
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
