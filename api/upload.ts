import { requireUser } from './_lib/auth.js';
import { getMethod, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { uploadMediaDataUrl } from './_lib/media.js';

interface UploadBody {
  dataUrl?: string;
  fileName?: string;
  kind?: 'image' | 'attachment';
}

export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendError(res, 500, 'Blob storage is not configured');
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const body = await readJsonBody<UploadBody>(req);
  if (!body.dataUrl || !body.fileName) {
    sendError(res, 400, 'dataUrl and fileName are required');
    return;
  }

  const kind = body.kind === 'attachment' ? 'attachment' : 'image';

  try {
    const url = await uploadMediaDataUrl(
      body.dataUrl,
      body.fileName,
      `pharmapop/upload/${user.id}/${kind}`,
      kind === 'attachment'
    );
    sendJson(res, 200, { url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    sendError(res, 400, message);
  }
}
