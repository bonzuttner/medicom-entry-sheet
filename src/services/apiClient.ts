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
      return 'セッションの有効期限が切れました。再ログインしてから、もう一度操作してください。';
    }

    const exactMap: Record<string, string> = {
      'Method not allowed': 'この操作は現在利用できません。画面を再読み込みして再試行してください。',
      'User not found': '対象のアカウントが見つかりません。アカウント一覧を更新して確認してください。',
      'User id is required': 'アカウントIDが不足しています。画面を再読み込みして再試行してください。',
      'user is required': 'アカウント情報が不足しています。入力内容を確認して再試行してください。',
      'username, displayName, manufacturerName are required':
        'アカウントの「ユーザー名・表示名・メーカー名」は必須です。未入力項目を入力してください。',
      'email and phoneNumber are required':
        'アカウントの「メールアドレス・電話番号」は必須です。未入力項目を入力してください。',
      'Username is already taken': 'ユーザー名が重複しています。別のユーザー名を入力してください。',
      'username and password are required':
        'ログインには「ユーザー名・パスワード」の両方が必要です。入力して再試行してください。',
      'Password is required for new users':
        '新規アカウントではパスワードが必須です。パスワードを入力してください。',
      'Password must include uppercase, lowercase, number, symbol, and be at least 8 characters':
        'パスワードは8文字以上で「大文字・小文字・数字・記号」をすべて含めて入力してください。',
      'You can only manage users in your manufacturer':
        '他社メーカーのアカウントは操作できません。自社メーカーのアカウントを選択してください。',
      'Only admins can manage admin users': '管理者アカウントを操作できるのは管理者のみです。',
      'Only admin can update master data': 'マスタを更新できるのは管理者のみです。',
      'Only admin can update admin memo': 'Adminメモを更新できるのは管理者のみです。',
      'data is required': '保存データが不足しています。入力内容を確認して再試行してください。',
      'Sheet id is required': 'エントリーシートIDが不足しています。画面を再読み込みして再試行してください。',
      'sheet is required': 'エントリーシート情報が不足しています。入力内容を確認して再試行してください。',
      'At least one product is required': '商品情報は1件以上の入力が必要です。商品を追加してください。',
      'You can only save sheets in your manufacturer':
        '他社メーカーのエントリーシートは保存できません。自社メーカーのシートを編集してください。',
      'You cannot modify this sheet': 'このエントリーシートを編集する権限がありません。',
      'You cannot modify this workflow status':
        'この進行状況へ変更する権限がありません。',
      'You cannot access this sheet': 'このエントリーシートを閲覧する権限がありません。',
      'Sheet not found': '対象のエントリーシートが見つかりません。一覧を更新して確認してください。',
      'Failed to reload saved sheet':
        '保存は完了しましたが、最新データの再取得に失敗しました。画面を再読み込みして確認してください。',
      'You cannot delete this sheet': 'このエントリーシートを削除する権限がありません。',
      'Only draft sheets can be deleted': '下書き状態のエントリーシートのみ削除できます。',
      'Only admin can access creatives': 'クリエイティブ機能を利用できるのは管理者のみです。',
      'Creative id is required': 'クリエイティブIDが不足しています。画面を再読み込みして再試行してください。',
      'creative is required': 'クリエイティブ情報が不足しています。入力内容を確認して再試行してください。',
      'Creative not found': '対象のクリエイティブが見つかりません。一覧を更新して確認してください。',
      'Target creative id is required':
        '差し替え先のクリエイティブIDが不足しています。画面を更新して再試行してください。',
      TARGET_CREATIVE_NOT_FOUND:
        '差し替え先のクリエイティブが見つかりません。一覧を更新して再試行してください。',
      CREATIVE_STILL_LINKED: '紐づいているエントリーシートがあるため、クリエイティブを削除できません。',
      SHEET_ALREADY_LINKED: '選択したエントリーシートは他のクリエイティブで使用中です。',
      SHEET_NOT_FOUND: '紐づけ対象のエントリーシートが見つかりません。',
      SHEET_MANUFACTURER_MISMATCH:
        '選択したエントリーシートのメーカーが一致していません。同じメーカーのシートのみ選択してください。',
      SHEET_WORKFLOW_LOCKED:
        'この状態のエントリーシートは、シート詳細で制作フローを戻してからクリエイティブを変更してください。',
      CREATIVE_REQUIRED_FIELDS:
        'クリエイティブ名、画像、メーカーは必須です。',
      MANUFACTURER_NOT_FOUND: 'メーカー情報の解決に失敗しました。メーカー設定を確認してください。',
      CREATIVE_RELOAD_FAILED:
        '保存は完了しましたが、最新のクリエイティブ情報の再取得に失敗しました。画面を更新してください。',
      'dataUrl and fileName are required':
        '画像アップロード情報が不足しています。画像を選択し直して再試行してください。',
      'Blob storage is not configured':
        '画像保存先の設定が未完了です。管理者に連絡してください。',
      'Bulk update is deprecated. Use /api/users/:id':
        '一括更新は利用できません。個別更新で実行してください。',
      'Manufacturer is required': 'メーカーが未選択です。メーカーを選択して再試行してください。',
      'Invalid data URL':
        '画像データの形式が不正です。画像を選択し直して再アップロードしてください。',
      'Only allowed Blob URLs are accepted':
        '添付URLの形式が不正です。画面から再アップロードした画像を選択してください。',
      'Attachment URL is required': '添付ファイルのURLが未設定です。ファイルをアップロードしてください。',
      'Unsupported image URL protocol':
        '画像URLの形式が不正です。http/https 形式のURLを使用してください。',
      'Invalid image URL':
        '画像URLが不正です。URLを確認するか、画像を再アップロードしてください。',
      'No images could be downloaded':
        '画像を取得できませんでした。URLを確認するか、時間をおいて再試行してください。',
      'Upload response does not include URL':
        'アップロード結果に画像URLが含まれていません。時間をおいて再試行してください。',
      VERSION_CONFLICT:
        '他のユーザーが先に更新しました。最新内容を確認してから保存してください。',
      '販促CDは X000000 形式で入力してください':
        '販促CDは X000000 形式で入力してください。',
      'ボードピッキングJANは13桁の数字で入力してください':
        'ボードピッキングJANは13桁の数字で入力してください。',
    };

    if (exactMap[normalized]) {
      return exactMap[normalized];
    }

    const retryMatch = normalized.match(/^Too many login attempts\. Retry in (\d+) seconds\.$/);
    if (retryMatch) {
      return `ログイン試行回数が上限に達しました。${retryMatch[1]}秒後に再試行してください。`;
    }

    const unsupportedFileTypeMatch = normalized.match(/^Unsupported file type: (.+)$/);
    if (unsupportedFileTypeMatch) {
      return `画像形式「${unsupportedFileTypeMatch[1]}」は未対応です。AI/PNG/JPEG/EPS 形式のファイルを選択してください。`;
    }

    const fetchImageFailedMatch = normalized.match(/^Failed to fetch image: (\d+)$/);
    if (fetchImageFailedMatch) {
      return `画像の取得に失敗しました（HTTP ${fetchImageFailedMatch[1]}）。URLを確認して再試行してください。`;
    }

    const migrationFailedMatch = normalized.match(/^Migration failed:\s*(.+)$/);
    if (migrationFailedMatch) {
      return `データ移行に失敗しました。内容を確認して再実行してください。（詳細: ${migrationFailedMatch[1]}）`;
    }

    const manufacturerNotFoundMatch = normalized.match(/^Manufacturer not found(?::| for .+:)\s*(.+)$/);
    if (manufacturerNotFoundMatch) {
      return `メーカー「${manufacturerNotFoundMatch[1]}」が見つかりません。メーカー情報を確認してください。`;
    }

    const passwordRequiredUserMatch = normalized.match(/^Password is required for user:\s*(.+)$/);
    if (passwordRequiredUserMatch) {
      return `ユーザー「${passwordRequiredUserMatch[1]}」のパスワードが未設定です。パスワードを入力してください。`;
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

  return normalizeKnownMessage(trimmed);
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
