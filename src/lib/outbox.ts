/**
 * Outbox: submissions that were made without a connection.
 *
 * Scope is deliberate. This queues work that is *already* asynchronous —
 * a 3D reconstruction job runs for hours on the worker computer, and a
 * feedback message is read whenever the administrator gets to it. Neither
 * loses anything by leaving an hour later.
 *
 * Inscription analysis is **not** queued, even though it is the most
 * expensive call. A reading is something the recorder is looking at right
 * now and will act on; delivering it silently three hours later, with no
 * notification system to announce it and no screen to receive it, would be
 * worse than an honest failure at the moment of the request. If background
 * delivery is built later — a notification, an inbox — analysis belongs here
 * too, and `register()` is where it plugs in.
 *
 * Its own IndexedDB database rather than a store inside `athar`, so the queue
 * can be upgraded, cleared or corrupted without putting a single saved
 * project at risk.
 */

const DB = "athar-outbox";
const STORE = "pending";
const VERSION = 1;

/** Give up after this many tries and wait for the user to decide. */
export const MAX_ATTEMPTS = 6;

export type OutboxKind = "reconstruction" | "feedback";

export type OutboxEntry = {
  id: string;
  kind: OutboxKind;
  /** What the user sees in the pending list. */
  label: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  /** Epoch ms; the entry is not retried before this. */
  nextAttemptAt: number;
  lastError?: string;
  /** Attempts are exhausted; retried only when the user asks. */
  stalled?: boolean;
};

/**
 * Exponential backoff with a ceiling, in milliseconds.
 *
 * Unbounded doubling would push the sixth retry past two hours, by which time
 * the user has walked out of signal again. Thirty seconds up to five minutes
 * matches how field connectivity actually behaves: it comes and goes.
 */
export function backoffMs(attempts: number): number {
  const base = 30_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 5 * 60_000);
}

export const isDue = (entry: OutboxEntry, now = Date.now()) =>
  !entry.stalled && entry.nextAttemptAt <= now;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("IndexedDB is unavailable in this browser context"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("Outbox storage error"));
      t.onabort = () => reject(t.error ?? new Error("Outbox transaction aborted"));
    });
  } finally {
    db.close();
  }
}

export const listOutbox = async (): Promise<OutboxEntry[]> =>
  (await tx<OutboxEntry[]>("readonly", (s) => s.getAll())).sort(
    (a, b) => a.createdAt - b.createdAt,
  );

export const removeFromOutbox = (id: string) => tx<void>("readwrite", (s) => s.delete(id));

const put = (entry: OutboxEntry) => tx<void>("readwrite", (s) => s.put(entry));

export async function enqueue(kind: OutboxKind, label: string, payload: unknown) {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    kind,
    label,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: Date.now(),
  };
  await put(entry);
  return entry;
}

/** Clears the stall flag so the next flush picks the entry up again. */
export async function retryNow(id: string) {
  const all = await listOutbox();
  const entry = all.find((e) => e.id === id);
  if (!entry) return;
  const { stalled: _dropped, ...rest } = entry;
  await put({ ...rest, attempts: 0, nextAttemptAt: Date.now() });
}

export type SendResult =
  | { ok: true }
  /** The server rejected it and will keep rejecting it — do not retry. */
  | { ok: false; permanent: true; error: string }
  /** Transient: no connection, a 5xx, a timeout. */
  | { ok: false; permanent: false; error: string };

type Sender = (payload: unknown) => Promise<SendResult>;

const senders = new Map<OutboxKind, Sender>();

/** Registers how one kind of entry is delivered. */
export const register = (kind: OutboxKind, sender: Sender) => senders.set(kind, sender);

export type FlushReport = {
  sent: number;
  failed: number;
  remaining: number;
  /** Entries dropped because the server rejected them outright. */
  discarded: { label: string; error: string }[];
};

let flushing = false;

/**
 * Attempts every entry that is due.
 *
 * Serial rather than parallel: these payloads carry photographs, and firing
 * a dozen multi-megabyte uploads at once over a recovering connection is how
 * you lose all of them instead of the first few.
 */
export async function flushOutbox(): Promise<FlushReport> {
  const report: FlushReport = { sent: 0, failed: 0, remaining: 0, discarded: [] };
  if (flushing) return report;
  flushing = true;
  try {
    const due = (await listOutbox()).filter((e) => isDue(e));
    for (const entry of due) {
      const send = senders.get(entry.kind);
      if (!send) continue;

      let result: SendResult;
      try {
        result = await send(entry.payload);
      } catch (err) {
        result = {
          ok: false,
          permanent: false,
          error: err instanceof Error ? err.message : "Send failed",
        };
      }

      if (result.ok) {
        await removeFromOutbox(entry.id);
        report.sent++;
        continue;
      }

      if (result.permanent) {
        // Retrying a rejected payload forever just burns the user's data.
        await removeFromOutbox(entry.id);
        report.discarded.push({ label: entry.label, error: result.error });
        continue;
      }

      const attempts = entry.attempts + 1;
      await put({
        ...entry,
        attempts,
        lastError: result.error,
        nextAttemptAt: Date.now() + backoffMs(attempts),
        ...(attempts >= MAX_ATTEMPTS ? { stalled: true } : {}),
      });
      report.failed++;
    }
    report.remaining = (await listOutbox()).length;
    return report;
  } finally {
    flushing = false;
  }
}
