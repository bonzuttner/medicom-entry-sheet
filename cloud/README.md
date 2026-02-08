# Cloud functions (初期実装)

このフォルダはVercelなどのサーバーレス環境にデプロイするためのサンプルです。

エンドポイント例:

- `GET /api/entries` - サンプルのエントリ一覧を返します。

ローカルでの確認方法:

1. Vercel CLIを利用する場合:

```bash
npm i -g vercel
vercel dev
```

2. `http://localhost:3000/api/entries` にアクセスしてJSONを確認してください。

デプロイ:

1. Vercelにログインしてプロジェクトを作成
2. リポジトリを接続してデプロイ
