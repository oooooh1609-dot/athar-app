/** Local project storage (IndexedDB). Everything here stays on this device. */

import type { EnhanceMode, EnhanceParams } from "./enhance-client";
import type { GeoFix } from "./geo";
import type { MeasurementSet } from "./measure";
import type { ReadingResult } from "./inscription-prompt";
import type { InscriptionToken } from "./alphabet-pack";

const DB = "athar";
const STORE = "projects";
/**
 * v3 added the `createdAt` index; v4 added optional `location` and
 * `measurements`. Both are optional, so old records stay readable as they are.
 */
const VERSION = 4;
const BY_CREATED = "createdAt";

export type Annotation = { x: number; y: number; w: number; h: number; label: string };

export type ReadingVersion = {
  id: string;
  createdAt: number;
  source: "machine" | "user";
  /** Full structured result for machine versions. */
  reading?: ReadingResult;
  /** Free text for user corrections. */
  text?: string;
  reason?: string;
};

export type AtharProject = {
  id: string;
  kind: "inscription" | "object" | "composition";
  name: string;
  notes: string;
  createdAt: number;
  /** Locally stored images. */
  original?: Blob;
  enhanced?: Blob;
  captures?: Blob[];
  mode?: EnhanceMode;
  params?: EnhanceParams;
  exportInfo?: string;
  machineReading?: ReadingResult | null;
  versions: ReadingVersion[];
  annotations: Annotation[];
  /** Reconstruction job reference; the model itself lives on the provider. */
  jobId?: string;
  modelUrl?: string;
  serverSide: boolean;
  consentToShare: boolean;
  /** Findspot, recorded only when the user asked for it. */
  location?: GeoFix;
  /** Scale reference and measurements placed on `original` / `enhanced`. */
  measurements?: MeasurementSet;
  /** Composed inscription written with the letter keyboards. */
  composition?: {
    scriptId: string;
    direction: "rtl" | "ltr";
    tokens: InscriptionToken[];
    text: string;
    transliteration: string;
    updatedAt: number;
  };
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("IndexedDB is unavailable in this browser context"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction!.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "id" });
      if (!store.indexNames.contains(BY_CREATED)) store.createIndex(BY_CREATED, "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
    // Fires when another tab holds the old version open during an upgrade.
    req.onblocked = () =>
      reject(new Error("Close the app's other open tabs so storage can be upgraded."));
  });
}

/**
 * Runs one request in its own transaction.
 *
 * The connection is closed on every exit path. Previously only `oncomplete`
 * closed it, so an aborted or failing transaction leaked a live connection —
 * and enough of those block the next version upgrade outright.
 */
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      let req: IDBRequest;
      try {
        req = run(t.objectStore(STORE));
      } catch (err) {
        return reject(err instanceof Error ? err : new Error("Storage error"));
      }
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("Storage error"));
      t.onabort = () => reject(t.error ?? new Error("Storage transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export async function saveProject(p: AtharProject) {
  try {
    await tx("readwrite", (s) => s.put(p));
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "QuotaExceededError")
      throw new Error(
        "Device storage is full. Delete an older project or export it before saving again.",
      );
    throw err;
  }
}

export async function listProjects(): Promise<AtharProject[]> {
  const all = await tx<AtharProject[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The newest `limit` projects, read backwards through the `createdAt` index.
 *
 * The home screen used `listProjects()` and threw away all but three, which
 * pulled every stored photograph and every 3D capture set into memory on each
 * visit to the tab. This touches only the records it returns.
 */
export async function recentProjects(limit = 3): Promise<AtharProject[]> {
  const db = await open();
  try {
    return await new Promise<AtharProject[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const out: AtharProject[] = [];
      const req = t.objectStore(STORE).index(BY_CREATED).openCursor(null, "prev");
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || out.length >= limit) return resolve(out);
        out.push(cursor.value as AtharProject);
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("Storage error"));
      t.onabort = () => reject(t.error ?? new Error("Storage transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export const getProject = (id: string) =>
  tx<AtharProject | undefined>("readonly", (s) => s.get(id));
export const deleteProject = (id: string) => tx<void>("readwrite", (s) => s.delete(id));

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

export const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export interface IndexedRecord {
  id: string;
  title: string;
  script: string;
  transcription: string;
  translation: string;
  tokens: string[];
  locationUtm: string;
  createdAt: number;
}

export class OfflineAtharDatabase {
  private static DB_NAME = "athar_epigraphic_fts_db";
  private static DB_VERSION = 1;
  private db: IDBDatabase | null = null;

  public async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OfflineAtharDatabase.DB_NAME, OfflineAtharDatabase.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("inscriptions")) {
          const store = db.createObjectStore("inscriptions", { keyPath: "id" });
          store.createIndex("tokens", "tokens", { multiEntry: true });
          store.createIndex("script", "script", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * توليد N-Grams ثلاثية للجذور والكلمات السامية لتمكين البحث الضبابي اللحظي
   */
  private generateNgrams(text: string): string[] {
    const clean = text
      .toLowerCase()
      .replace(/[𐩽،,.\-_]/gu, " ")
      .trim();
    const words = clean.split(/\s+/);
    const tokens = new Set<string>();

    for (const word of words) {
      if (word.length >= 2) tokens.add(word);
      // توليد ثلاثيات الأحرف
      for (let i = 0; i <= word.length - 3; i++) {
        tokens.add(word.substring(i, i + 3));
      }
    }

    return Array.from(tokens);
  }

  /**
   * إضافة نقش أثري جديد مع فهرسته لحظياً
   */
  public async insertRecord(record: Omit<IndexedRecord, "tokens" | "createdAt">): Promise<void> {
    await this.init();
    const tokens = this.generateNgrams(
      `${record.title} ${record.transcription} ${record.translation}`,
    );

    const item: IndexedRecord = {
      ...record,
      tokens,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("inscriptions", "readwrite");
      tx.objectStore("inscriptions").put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * بحث سريع بنظام الفهرسة المعكوسة (Inverted Index)
   */
  public async search(query: string): Promise<IndexedRecord[]> {
    await this.init();
    const queryTokens = this.generateNgrams(query);
    if (queryTokens.length === 0) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("inscriptions", "readonly");
      const store = tx.objectStore("inscriptions");
      const index = store.index("tokens");

      const matches = new Map<string, { record: IndexedRecord; score: number }>();
      let completedQueries = 0;

      for (const token of queryTokens) {
        const req = index.getAll(token);
        req.onsuccess = () => {
          for (const rec of req.result as IndexedRecord[]) {
            const existing = matches.get(rec.id);
            if (existing) {
              existing.score += 1;
            } else {
              matches.set(rec.id, { record: rec, score: 1 });
            }
          }

          completedQueries++;
          if (completedQueries === queryTokens.length) {
            // ترتيب النتائج بحسب درجة التطابق
            const sorted = Array.from(matches.values())
              .sort((a, b) => b.score - a.score)
              .map((entry) => entry.record);
            resolve(sorted);
          }
        };
        req.onerror = () => reject(req.error);
      }
    });
  }
}
