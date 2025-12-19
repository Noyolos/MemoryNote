const DB_NAME = "memory-particles";
const DB_VERSION = 1;
const STORE_MEMORIES = "memories";
const STORE_ASSETS = "assets";
export const SCHEMA_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEMORIES)) {
        const store = db.createObjectStore(STORE_MEMORIES, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createMemoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mem-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export class WebStorageProvider {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    this.db = await openDatabase();
    return this.db;
  }

  async saveMemory(record, { thumbBlob, renderBlob }) {
    if (!thumbBlob || !renderBlob) throw new Error("Missing blobs for saveMemory");
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ASSETS, STORE_MEMORIES], "readwrite");
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);

      const assets = tx.objectStore(STORE_ASSETS);
      assets.put({ key: record.assets.thumbKey, mime: thumbBlob.type, blob: thumbBlob });
      assets.put({ key: record.assets.renderKey, mime: renderBlob.type, blob: renderBlob });

      const memories = tx.objectStore(STORE_MEMORIES);
      memories.put(record);
    });
  }

  async getMemories() {
    const db = await this.init();
    const tx = db.transaction(STORE_MEMORIES, "readonly");
    const store = tx.objectStore(STORE_MEMORIES);
    const index = store.index("createdAt");

    return new Promise((resolve, reject) => {
      const results = [];
      const request = index.openCursor(null, "prev");

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAsset(key) {
    if (!key) return null;
    const db = await this.init();
    const tx = db.transaction(STORE_ASSETS, "readonly");
    const store = tx.objectStore(STORE_ASSETS);
    const request = store.get(key);
    return promisifyRequest(request);
  }
}
