import { requireUser } from './_lib/auth.js';
import { getMethod, methodNotAllowed, sendJson } from './_lib/http.js';

// Simple Vercel-compatible serverless function (TypeScript)
export default async function handler(req: any, res: any) {
  if (getMethod(req) !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const currentUser = await requireUser(req, res);
  if (!currentUser) return;

  const entries = [
    { id: "1", name: "山田太郎", date: "2026-02-08" },
    { id: "2", name: "鈴木花子", date: "2026-02-07" }
  ];
  sendJson(res, 200, entries);
}
