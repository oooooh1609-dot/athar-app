/**
 * Isolated runner for browser extensions.
 *
 * An imported module never runs in the application context and is never passed
 * to `eval` or `new Function`. It is concatenated after a prelude that shadows
 * the network, storage and script-loading globals, turned into a module Worker,
 * and given only the pixels of the file the user selected for this one run. The
 * worker is terminated on timeout, on cancellation and when the run finishes, so
 * a stuck extension cannot keep the device busy.
 */

import type { ExtensionParam } from "./extension-contract";

export type SandboxProgress = { progress: number; note?: string };

export type SandboxResult =
  | { ok: true; width: number; height: number; data: Uint8ClampedArray; ms: number }
  | { ok: false; error: string; ms: number };

/**
 * Capabilities removed from the module's scope. Because the prelude is part of
 * the same module, these declarations shadow the worker globals for the whole
 * extension: it cannot call the network or touch storage even if it tries.
 */
const PRELUDE = `const fetch = undefined, XMLHttpRequest = undefined, WebSocket = undefined,
  importScripts = undefined, indexedDB = undefined, caches = undefined,
  Notification = undefined, SharedWorker = undefined, Worker = undefined;
`;

const BOOTSTRAP = `
self.onmessage = async (ev) => {
  const { input, params } = ev.data;
  const report = (progress, note) =>
    self.postMessage({ type: "progress", progress: Math.max(0, Math.min(1, Number(progress) || 0)), note });
  try {
    if (typeof process !== "function") throw new Error("the module does not export process(request)");
    const out = await process({ ...input, params, report });
    if (!out || !out.data || !out.width || !out.height) throw new Error("the module returned no image");
    const data = out.data instanceof Uint8ClampedArray ? out.data : new Uint8ClampedArray(out.data);
    self.postMessage({ type: "done", width: out.width, height: out.height, buffer: data.buffer }, [data.buffer]);
  } catch (e) {
    self.postMessage({ type: "error", error: e && e.message ? e.message : "the extension failed" });
  }
};
`;

export type SandboxRun = {
  /** Resolves with the extension's output, an error, or a timeout. */
  result: Promise<SandboxResult>;
  /** Stops the extension immediately. */
  cancel: () => void;
};

export function runBrowserExtension(opts: {
  moduleSource: string;
  image: { width: number; height: number; data: Uint8ClampedArray };
  params?: Record<string, number | boolean | string>;
  timeoutMs?: number;
  onProgress?: (p: SandboxProgress) => void;
}): SandboxRun {
  const started = performance.now();
  const timeoutMs = opts.timeoutMs ?? 20000;
  const url = URL.createObjectURL(
    new Blob([PRELUDE, opts.moduleSource, BOOTSTRAP], { type: "text/javascript" }),
  );
  const worker = new Worker(url, { type: "module" });

  let settle: (r: SandboxResult) => void = () => {};
  const result = new Promise<SandboxResult>((resolve) => {
    settle = resolve;
  });

  const finish = (r: SandboxResult) => {
    window.clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(url);
    settle(r);
  };
  const ms = () => Math.round(performance.now() - started);

  const timer = window.setTimeout(
    () =>
      finish({
        ok: false,
        error: `the extension exceeded its ${timeoutMs / 1000}s limit`,
        ms: ms(),
      }),
    timeoutMs,
  );

  worker.onmessage = (ev: MessageEvent) => {
    const d = ev.data as
      | { type: "progress"; progress: number; note?: string }
      | { type: "done"; width: number; height: number; buffer: ArrayBuffer }
      | { type: "error"; error: string };
    if (d.type === "progress")
      opts.onProgress?.({ progress: d.progress, ...(d.note ? { note: d.note } : {}) });
    else if (d.type === "done")
      finish({
        ok: true,
        width: d.width,
        height: d.height,
        data: new Uint8ClampedArray(d.buffer),
        ms: ms(),
      });
    else finish({ ok: false, error: d.error, ms: ms() });
  };
  worker.onerror = (e) =>
    finish({ ok: false, error: e.message || "the extension could not be loaded", ms: ms() });

  // A copy is sent, so the extension cannot alter the caller's original pixels.
  const copy = new Uint8ClampedArray(opts.image.data);
  worker.postMessage(
    {
      input: { width: opts.image.width, height: opts.image.height, data: copy },
      params: opts.params ?? {},
    },
    [copy.buffer],
  );

  return { result, cancel: () => finish({ ok: false, error: "cancelled", ms: ms() }) };
}

/** Fills in the declared defaults for any parameter the caller left out. */
export function withDefaults(
  params: ExtensionParam[] | undefined,
  given: Record<string, number | boolean | string>,
) {
  const out: Record<string, number | boolean | string> = {};
  for (const p of params ?? []) out[p.key] = given[p.key] ?? p.default;
  return out;
}
