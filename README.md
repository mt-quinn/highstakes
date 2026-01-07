# High Stakes (mobile daily web game)

## Local dev

```bash
cd high-stakes
npm install
npm run dev
```

## Environment variables

- **OPENAI_API_KEY**: required
- **HIGH_STAKES_MODEL_ID**: optional (defaults to `gpt-5.2-2025-12-11`)

### Invention images (optional)
- **GEMINI_API_KEY**: enables invention image generation
- **GEMINI_IMAGE_MODEL_ID**: optional (defaults to `gemini-2.5-flash-image`)
- **BLOB_READ_WRITE_TOKEN**: optional; if present, invention images are stored in Vercel Blob. If absent, images are returned as data URLs (fine for local dev).

### Vercel KV (recommended for deployment)
If these are present, the app uses Vercel KV for caching daily/random slates:

- **KV_REST_API_URL**
- **KV_REST_API_TOKEN**

If they are not present, the app falls back to an in-memory cache (fine for local dev, not consistent across server restarts).


