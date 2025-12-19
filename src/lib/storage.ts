import { kv as vercelKv } from "@vercel/kv";

type StoredValue = { value: string; expiresAt?: number };

function getMemoryStore(): Map<string, StoredValue> {
  const g = globalThis as any;
  if (!g.__PG_MEM_KV__) {
    g.__PG_MEM_KV__ = new Map<string, StoredValue>();
  }
  return g.__PG_MEM_KV__ as Map<string, StoredValue>;
}

function hasVercelKV(): boolean {
  // Vercel KV typically provides these env vars.
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  if (hasVercelKV()) {
    const raw = await vercelKv.get<string>(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const store = getMemoryStore();
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

export async function kvSetJSON(
  key: string,
  value: unknown,
  opts?: { exSeconds?: number },
): Promise<void> {
  const raw = JSON.stringify(value);
  if (hasVercelKV()) {
    if (opts?.exSeconds) {
      await vercelKv.set(key, raw, { ex: opts.exSeconds });
    } else {
      await vercelKv.set(key, raw);
    }
    return;
  }

  const store = getMemoryStore();
  const expiresAt =
    typeof opts?.exSeconds === "number" ? Date.now() + opts.exSeconds * 1000 : undefined;
  store.set(key, { value: raw, expiresAt });
}


