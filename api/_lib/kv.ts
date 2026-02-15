const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export const hasKvConfig = (): boolean => Boolean(KV_URL && KV_TOKEN);

type KvArg = string | number;

export const runKvCommand = async <T = unknown>(...command: KvArg[]): Promise<T> => {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error(
      'Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.'
    );
  }

  const response = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`KV request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) {
    throw new Error(`KV error: ${payload.error}`);
  }

  return payload.result as T;
};
