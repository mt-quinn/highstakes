# Pearly Gates (mobile daily web game)

## Local dev

```bash
cd pearly-gates
npm install
npm run dev
```

## Environment variables

- **OPENAI_API_KEY**: required
- **PEARLY_GATES_MODEL_ID**: optional (defaults to `gpt-5.2-2025-12-11`)

### Vercel KV (recommended for deployment)
If these are present, the app uses Vercel KV for caching daily/random profiles:

- **KV_REST_API_URL**
- **KV_REST_API_TOKEN**

If they are not present, the app falls back to an in-memory cache (fine for local dev, not consistent across server restarts).


