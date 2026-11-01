const db_name = 'yoboba-radio';
const store_name = 'tracks';
const memory = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob>>();

function open_db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(db_name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(store_name)) req.result.createObjectStore(store_name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', on_abort);
      resolve();
    }, ms);
    const on_abort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', on_abort, { once: true });
  });
}

async function read_saved(id: string, bytes: number) {
  const hot = memory.get(id);
  if (hot && hot.size > 200_000 && (!bytes || hot.size === bytes)) return hot;
  const db = await open_db();
  if (!db) return null;
  const blob = await new Promise<Blob | null>((resolve) => {
    const tx = db.transaction(store_name, 'readonly');
    const req = tx.objectStore(store_name).get(id);
    req.onsuccess = () => {
      const value = req.result as unknown;
      resolve(value instanceof Blob ? value : null);
    };
    req.onerror = () => resolve(null);
  });
  db.close();
  if (!blob || blob.size < 200_000) return null;
  if (bytes && blob.size !== bytes) return null;
  memory.set(id, blob);
  return blob;
}

async function save_blob(id: string, blob: Blob) {
  memory.set(id, blob);
  const db = await open_db();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store_name, 'readwrite');
    tx.objectStore(store_name).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function forget_other_radio(ids: string[]) {
  const keep = new Set(ids);
  for (const id of memory.keys()) {
    if (!keep.has(id)) memory.delete(id);
  }
  const db = await open_db();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(store_name, 'readwrite');
    const req = tx.objectStore(store_name).getAllKeys();
    req.onsuccess = () => {
      for (const key of req.result) {
        if (typeof key === 'string' && !keep.has(key)) tx.objectStore(store_name).delete(key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

function looks_like_mp3(bytes: Uint8Array) {
  if (bytes.length < 3) return false;
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  return id3 || bytes[0] === 0xff;
}

async function download_radio(id: string, bytes: number, retry: boolean, signal?: AbortSignal) {
  const saved = await read_saved(id, bytes);
  if (saved) return saved;
  const deadline = Date.now() + 90 * 60 * 1000;
  let first = true;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const query = new URLSearchParams({ id });
    if (retry && first) query.set('retry', '1');
    first = false;
    const res = await fetch(`/api/seller/radio/file?${query}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    if (res.status === 202) {
      await sleep(2000, signal);
      continue;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || 'не скачалось');
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('audio')) throw new Error('не скачалось');
    const blob = await res.blob();
    const expected = Number(res.headers.get('content-length'));
    const head = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
    const short = expected > 0 && blob.size < expected * 0.98;
    if (!looks_like_mp3(head) || blob.size < 200_000 || short) throw new Error('файл оборвался');
    await save_blob(id, blob);
    return blob;
  }
  throw new Error('долго качается');
}

export function peek_radio_blob(id: string, bytes: number) {
  const hot = memory.get(id);
  if (hot && hot.size > 200_000 && (!bytes || hot.size === bytes)) return hot;
  return null;
}

export function pull_radio_file(id: string, bytes: number, retry: boolean, signal?: AbortSignal) {
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = download_radio(id, bytes, retry, signal).finally(() => {
    if (inflight.get(id) === job) inflight.delete(id);
  });
  inflight.set(id, job);
  return job;
}
