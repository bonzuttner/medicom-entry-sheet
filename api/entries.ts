// Simple Vercel-compatible serverless function (TypeScript)
export default function handler(req: any, res: any) {
  const entries = [
    { id: "1", name: "山田太郎", date: "2026-02-08" },
    { id: "2", name: "鈴木花子", date: "2026-02-07" }
  ];

  // Respond with JSON
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(200).json(entries);
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(entries));
}
