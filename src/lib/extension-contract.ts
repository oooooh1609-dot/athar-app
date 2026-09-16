/**
 * Versioned extension contract, shared by the administrator screen and the
 * backend. Nothing here executes code: it only describes and validates what an
 * extension claims about itself, so the administrator can review a manifest
 * before anything is enabled.
 *
 * Contract version 1.
 */

export const EXTENSION_CONTRACT_VERSION = 1;

/** Where an extension really runs. This is not negotiable at activation time. */
export type ExtensionRuntime =
  /** JavaScript/WASM that runs in an isolated Web Worker in this browser. */
  | "browser"
  /** An authenticated HTTPS API called from the server, with server-side secrets. */
  | "backend"
  /** A program such as Meshroom running on the administrator's own computer. */
  | "external_worker";

export type ExtensionStatus =
  "imported" | "validated" | "tested" | "enabled" | "disabled" | "failed";

/** Screens an enabled extension may be offered on. */
export type ExtensionSurface = "camera" | "editor" | "library" | "three_d";

export type ExtensionIo =
  | "image/jpeg"
  | "image/png"
  | "image/*"
  | "application/pdf"
  | "text/plain"
  | "application/json"
  | "model/gltf-binary";

export type ExtensionParam = {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

/** The permissions an extension may request. Anything else is rejected. */
export const KNOWN_PERMISSIONS = [
  /** Receives only the one file the user picked for this run. */
  "read:selected-file",
  /** Returns a processed file, saved separately from the original. */
  "write:derived-output",
  /** Reports progress events while running. */
  "report:progress",
] as const;
export type ExtensionPermission = (typeof KNOWN_PERMISSIONS)[number];

export type ExtensionManifest = {
  contract: number;
  name: string;
  version: string;
  purpose: string;
  runtime: ExtensionRuntime;
  license: string;
  sourceUrl?: string;
  /** Free text: GPU, RAM, installed software, hosting. */
  requirements?: string;
  surfaces: ExtensionSurface[];
  inputs: ExtensionIo[];
  outputs: ExtensionIo[];
  params?: ExtensionParam[];
  permissions: ExtensionPermission[];
  /** True when the extension depends on a paid API, hosting or hardware. */
  needsPaidService?: boolean;
  /** For backend/external runtimes: the endpoint the administrator registers. */
  endpoint?: string;
};

const RUNTIMES: ExtensionRuntime[] = ["browser", "backend", "external_worker"];
const SURFACES: ExtensionSurface[] = ["camera", "editor", "library", "three_d"];

const isStr = (v: unknown, max = 400) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

/**
 * Validates a manifest strictly. A manifest that asks for isolation we cannot
 * enforce — an unknown permission, or browser code with a non-browser runtime —
 * is rejected rather than downgraded silently.
 */
export function validateManifest(
  input: unknown,
  opts: { hasModule: boolean },
): { ok: true; manifest: ExtensionManifest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const m = (input ?? {}) as Record<string, unknown>;

  if (m["contract"] !== EXTENSION_CONTRACT_VERSION)
    errors.push(`contract must be ${EXTENSION_CONTRACT_VERSION}`);
  if (!isStr(m["name"], 120)) errors.push("name is required");
  if (!isStr(m["version"], 40)) errors.push("version is required");
  if (!isStr(m["purpose"], 1000)) errors.push("purpose is required");
  if (!isStr(m["license"], 200)) errors.push("license is required");
  if (!RUNTIMES.includes(m["runtime"] as ExtensionRuntime))
    errors.push("runtime must be browser, backend or external_worker");

  const surfaces = Array.isArray(m["surfaces"]) ? (m["surfaces"] as unknown[]) : [];
  if (!surfaces.length) errors.push("at least one surface is required");
  if (surfaces.some((s) => !SURFACES.includes(s as ExtensionSurface)))
    errors.push("unknown surface");

  const inputs = Array.isArray(m["inputs"]) ? (m["inputs"] as unknown[]) : [];
  const outputs = Array.isArray(m["outputs"]) ? (m["outputs"] as unknown[]) : [];
  if (!inputs.length) errors.push("at least one input type is required");
  if (!outputs.length) errors.push("at least one output type is required");

  const perms = Array.isArray(m["permissions"]) ? (m["permissions"] as unknown[]) : [];
  const unknown = perms.filter((p) => !KNOWN_PERMISSIONS.includes(p as ExtensionPermission));
  if (unknown.length)
    errors.push(
      `these permissions cannot be enforced and are refused: ${unknown.map(String).join(", ")}`,
    );

  const runtime = m["runtime"] as ExtensionRuntime;
  if (runtime === "browser" && !opts.hasModule)
    errors.push("a browser extension must include its JavaScript module");
  if (runtime !== "browser" && opts.hasModule)
    errors.push(
      "only browser extensions may carry JavaScript; Python, GPU programs and native code cannot run in a browser",
    );
  if (runtime !== "browser" && !isStr(m["endpoint"], 400))
    errors.push("backend and external-worker extensions need the endpoint they connect to");

  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: m as unknown as ExtensionManifest };
}

/** Plain-language compatibility note shown before activation. */
export function compatibilityNote(runtime: ExtensionRuntime): string {
  if (runtime === "browser")
    return "Runs inside this browser in an isolated worker. No network access is granted, and it only receives the file selected for the run.";
  if (runtime === "backend")
    return "Runs on the server against an authenticated API. Its key is stored as a server secret and is never sent to the browser.";
  return "Runs on a separate computer or server you control. It is unavailable until that program actually connects.";
}

/** Rejects code that tries to reach outside the sandbox contract. */
const FORBIDDEN = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /\bimportScripts\s*\(/,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /indexedDB/,
  /localStorage/,
  /document\./,
];

export function scanModuleSource(source: string): string[] {
  const problems: string[] = [];
  if (source.length > 400_000) problems.push("the module is larger than 400 KB");
  if (!/process\s*\(/.test(source))
    problems.push("the module must export a process(request) function");
  for (const rx of FORBIDDEN)
    if (rx.test(source)) problems.push(`the module uses a forbidden capability: ${String(rx)}`);
  return problems;
}
