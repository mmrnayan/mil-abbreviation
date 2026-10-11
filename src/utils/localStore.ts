/** Durable app storage. Failed writes are surfaced; submission never pretends to succeed. */
const DB = "sac-offline";
const STORE = "records";
const FALLBACK = "sac:offline:";

async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLocal<T>(key: string): Promise<T | undefined> {
  // Once fallback is used, keep the same storage backend across restarts.
  if (localStorage.getItem(`${FALLBACK}backend`) === "localstorage") {
    const raw = localStorage.getItem(FALLBACK + key);
    return raw ? JSON.parse(raw) as T : undefined;
  }
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeLocal<T>(key: string, value: T): Promise<void> {
  if (localStorage.getItem(`${FALLBACK}backend`) === "localstorage") {
    localStorage.setItem(FALLBACK + key, JSON.stringify(value));
    return;
  }
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function initializeLocalStore(): Promise<void> {
  if (localStorage.getItem(`${FALLBACK}backend`) === "localstorage") return;
  try { const db = await open(); db.close(); }
  catch {
    // Do not abandon an existing IndexedDB store during a transient error.
    if (localStorage.getItem(`${FALLBACK}initialized`)) throw new Error("Local storage is temporarily unavailable. Try reopening the app.");
    localStorage.setItem(`${FALLBACK}backend`, "localstorage");
  }
  localStorage.setItem(`${FALLBACK}initialized`, "yes");
}

/** Serialize mutations across tabs when Web Locks is available, and within this window otherwise. */
const pending = new Map<string, Promise<unknown>>();
export function withLocalLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`sac:${name}`, action).then((value) => value);
  const next = (pending.get(name) ?? Promise.resolve()).then(action, action);
  pending.set(name, next.catch(() => undefined));
  return next;
}
