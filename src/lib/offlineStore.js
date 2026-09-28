// Archivio sul dispositivo (IndexedDB) per lavorare senza rete:
// - "cache": ultime letture dal server, usate quando la rete non c'è;
// - "queue": modifiche fatte offline (giornaliera, foto) da inviare appena torna la connessione.
const DB_NAME = "talo-offline";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB non disponibile"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
        if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ─── Letture in cache ───

export const cacheGet = (key) => tx("cache", "readonly", (s) => s.get(key)).catch(() => undefined);
export const cacheSet = (key, value) => tx("cache", "readwrite", (s) => s.put({ value, at: Date.now() }, key)).catch(() => {});
export const cacheClear = () => tx("cache", "readwrite", (s) => s.clear()).catch(() => {});

// ─── Coda delle modifiche ───

const listeners = new Set();
const emit = () => { for (const l of listeners) l(); };
export const onQueueChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function enqueue(item) {
  const entry = { id: crypto.randomUUID(), created: Date.now(), ...item };
  await tx("queue", "readwrite", (s) => s.put(entry));
  emit();
  return entry;
}
export const queueAll = () => tx("queue", "readonly", (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.created - b.created)).catch(() => []);
export async function dequeue(id) { await tx("queue", "readwrite", (s) => s.delete(id)).catch(() => {}); emit(); }
export async function clearAll() { await tx("queue", "readwrite", (s) => s.clear()).catch(() => {}); await cacheClear(); emit(); }

export const isNetworkError = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request|fetch failed/i.test(String(e?.message || e));
