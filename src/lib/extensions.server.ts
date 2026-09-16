/**
 * Administrator-only extension registry.
 *
 * Every call here is reached only through `/api/admin/extensions`, which is
 * gated on the administrator session — hiding the menu is never the control.
 * Imported code is stored and reviewed; it is never executed on the server.
 * Backend integrations keep their key as a server secret: only the secret's
 * name is stored, and log lines are redacted before they are written.
 */

import {
  validateManifest,
  scanModuleSource,
  type ExtensionManifest,
  type ExtensionStatus,
} from "./extension-contract";
import {
  LOCAL_CONTRAST_MANIFEST,
  LOCAL_CONTRAST_MODULE,
  MESHROOM_MANIFEST,
} from "./extension-builtin";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ExtensionRow = {
  id: string;
  slug: string;
  name: string;
  version: string;
  purpose: string;
  runtime: "browser" | "backend" | "external_worker";
  license: string;
  source_url: string | null;
  requirements: string | null;
  endpoint: string | null;
  needs_paid_service: boolean;
  manifest: ExtensionManifest;
  module_source: string | null;
  status: ExtensionStatus;
  status_note: string | null;
  builtin: boolean;
  secret_name: string | null;
  last_test_at: string | null;
  last_test_note: string | null;
  previous_version: { manifest: ExtensionManifest; module_source: string | null } | null;
  created_at: string;
  updated_at: string;
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "extension";

/** Removes anything that looks like a credential before a log line is stored. */
export function redact(text: string) {
  return text
    .replace(/\b(atw|sb|sk|pk|ghp|eyJ)[A-Za-z0-9._-]{8,}/g, "[redacted]")
    .replace(
      /(authorization|bearer|token|secret|password|apikey|api_key)\s*[:=]\s*\S+/gi,
      "$1: [redacted]",
    )
    .slice(0, 4000);
}

export async function logRun(entry: {
  extensionId: string;
  version: string;
  event: string;
  detail?: string | null;
  surface?: string | null;
  durationMs?: number | null;
  actor?: string;
}) {
  const client = await db();
  await client.from("extension_runs").insert({
    extension_id: entry.extensionId,
    extension_version: entry.version,
    event: entry.event,
    detail: entry.detail ? redact(entry.detail) : null,
    surface: entry.surface ?? null,
    duration_ms: entry.durationMs ?? null,
    actor: entry.actor ?? "administrator",
  });
}

/** Registers the bundled example extension and the Meshroom worker integration. */
export async function ensureBuiltins() {
  const client = await db();
  const seeds: Array<{
    slug: string;
    manifest: ExtensionManifest;
    module: string | null;
    status: ExtensionStatus;
  }> = [
    {
      slug: "athar-local-contrast",
      manifest: LOCAL_CONTRAST_MANIFEST,
      module: LOCAL_CONTRAST_MODULE,
      // Bundled and verified in this project, so it starts enabled.
      status: "enabled",
    },
    {
      slug: "meshroom-alicevision",
      manifest: MESHROOM_MANIFEST,
      module: null,
      // Registered only: it is unavailable until a real worker connects.
      status: "validated",
    },
  ];

  for (const seed of seeds) {
    const existing = await client
      .from("extensions")
      .select("id")
      .eq("slug", seed.slug)
      .maybeSingle();
    if (existing.data) continue;
    await client.from("extensions").insert({
      slug: seed.slug,
      name: seed.manifest.name,
      version: seed.manifest.version,
      purpose: seed.manifest.purpose,
      runtime: seed.manifest.runtime,
      license: seed.manifest.license,
      source_url: seed.manifest.sourceUrl ?? null,
      requirements: seed.manifest.requirements ?? null,
      endpoint: seed.manifest.endpoint ?? null,
      needs_paid_service: Boolean(seed.manifest.needsPaidService),
      manifest: seed.manifest,
      module_source: seed.module,
      status: seed.status,
      builtin: true,
    });
  }
}

export async function listExtensions() {
  await ensureBuiltins();
  const client = await db();
  const res = await client
    .from("extensions")
    .select("*")
    .order("builtin", { ascending: false })
    .order("created_at", { ascending: true });
  if (res.error) throw new Error(res.error.message);
  const { anyWorkerOnline } = await import("./recon.server");
  const workerOnline = await anyWorkerOnline();
  return { extensions: (res.data ?? []) as ExtensionRow[], workerOnline };
}

export async function listRuns(limit = 60) {
  const client = await db();
  const res = await client
    .from("extension_runs")
    .select("id, extension_id, extension_version, event, detail, surface, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

type ImportResult =
  | { ok: true; extension: ExtensionRow; note: string }
  | { ok: false; error: string; errors?: string[] };

/**
 * Imports a manifest, optionally with its JavaScript module. Nothing is
 * activated: a valid import lands in `validated`, and it must be tested before
 * it can be enabled.
 */
export async function importExtension(input: {
  manifest: unknown;
  moduleSource?: string | null;
  secretName?: string | null;
}): Promise<ImportResult> {
  const hasModule = Boolean(input.moduleSource && input.moduleSource.trim());
  const checked = validateManifest(input.manifest, { hasModule });
  if (!checked.ok)
    return { ok: false, error: "This manifest was refused.", errors: checked.errors };
  const manifest = checked.manifest;

  if (hasModule) {
    const problems = scanModuleSource(input.moduleSource!);
    if (problems.length) return { ok: false, error: "This module was refused.", errors: problems };
  }

  const client = await db();
  const slug = slugify(`${manifest.name}-${manifest.version}`);
  const dup = await client.from("extensions").select("id").eq("slug", slug).maybeSingle();
  if (dup.data)
    return { ok: false, error: "An extension with this name and version already exists." };

  const res = await client
    .from("extensions")
    .insert({
      slug,
      name: manifest.name,
      version: manifest.version,
      purpose: manifest.purpose,
      runtime: manifest.runtime,
      license: manifest.license,
      source_url: manifest.sourceUrl ?? null,
      requirements: manifest.requirements ?? null,
      endpoint: manifest.endpoint ?? null,
      needs_paid_service: Boolean(manifest.needsPaidService),
      manifest,
      module_source: hasModule ? input.moduleSource! : null,
      status: "validated",
      status_note: "Validated. Test it on a sample before enabling.",
      secret_name: input.secretName ?? null,
    })
    .select("*")
    .single();
  if (res.error) return { ok: false, error: res.error.message };
  const row = res.data as ExtensionRow;
  await logRun({ extensionId: row.id, version: row.version, event: "imported" });
  return {
    ok: true,
    extension: row,
    note: "Imported and validated. It is not running yet: test it first, then enable it.",
  };
}

/** Registers a GitHub or other source URL for review only. No code is fetched. */
export async function registerSource(input: {
  name: string;
  sourceUrl: string;
  purpose: string;
  runtime: "browser" | "backend" | "external_worker";
  license: string;
  requirements?: string;
  endpoint?: string;
  needsPaidService?: boolean;
}): Promise<ImportResult> {
  const manifest: ExtensionManifest = {
    contract: 1,
    name: input.name,
    version: "0.0.0-source",
    purpose: input.purpose,
    runtime: input.runtime,
    license: input.license,
    sourceUrl: input.sourceUrl,
    ...(input.requirements ? { requirements: input.requirements } : {}),
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    surfaces: input.runtime === "external_worker" ? ["three_d"] : ["editor"],
    inputs: ["image/*"],
    outputs: input.runtime === "external_worker" ? ["model/gltf-binary"] : ["image/jpeg"],
    permissions: ["read:selected-file", "write:derived-output"],
    needsPaidService: Boolean(input.needsPaidService),
  };
  const checked = validateManifest(manifest, { hasModule: false });
  if (!checked.ok) return { ok: false, error: "This source was refused.", errors: checked.errors };

  const client = await db();
  const slug = slugify(`${input.name}-source`);
  const dup = await client.from("extensions").select("id").eq("slug", slug).maybeSingle();
  if (dup.data) return { ok: false, error: "This source is already registered." };

  const res = await client
    .from("extensions")
    .insert({
      slug,
      name: input.name,
      version: manifest.version,
      purpose: input.purpose,
      runtime: input.runtime,
      license: input.license,
      source_url: input.sourceUrl,
      requirements: input.requirements ?? null,
      endpoint: input.endpoint ?? null,
      needs_paid_service: Boolean(input.needsPaidService),
      manifest,
      status: "imported",
      status_note:
        "Registered for review only. No code was downloaded or run. Review the source, then import its manifest and module.",
    })
    .select("*")
    .single();
  if (res.error) return { ok: false, error: res.error.message };
  const row = res.data as ExtensionRow;
  await logRun({
    extensionId: row.id,
    version: row.version,
    event: "source_registered",
    detail: input.sourceUrl,
  });
  return {
    ok: true,
    extension: row,
    note: "Source registered for review. Nothing was downloaded or executed.",
  };
}

/** Records the outcome of a real test run performed in the browser sandbox. */
export async function recordTest(input: {
  id: string;
  passed: boolean;
  note: string;
  durationMs?: number;
}) {
  const client = await db();
  const cur = await client.from("extensions").select("*").eq("id", input.id).maybeSingle();
  const row = cur.data as ExtensionRow | null;
  if (!row) return { ok: false as const, error: "Unknown extension." };
  await client
    .from("extensions")
    .update({
      status: input.passed ? "tested" : "failed",
      status_note: redact(input.note),
      last_test_at: new Date().toISOString(),
      last_test_note: redact(input.note),
    })
    .eq("id", input.id);
  await logRun({
    extensionId: row.id,
    version: row.version,
    event: input.passed ? "test_passed" : "test_failed",
    detail: input.note,
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
  });
  return { ok: true as const };
}

export async function setStatus(id: string, status: "enabled" | "disabled") {
  const client = await db();
  const cur = await client.from("extensions").select("*").eq("id", id).maybeSingle();
  const row = cur.data as ExtensionRow | null;
  if (!row) return { ok: false as const, error: "Unknown extension." };
  if (status === "enabled" && !["tested", "disabled", "enabled"].includes(row.status))
    return {
      ok: false as const,
      error: "Test this extension on a sample before enabling it.",
    };
  await client.from("extensions").update({ status, status_note: null }).eq("id", id);
  await logRun({ extensionId: id, version: row.version, event: status });
  return { ok: true as const };
}

/** Stages an update. The new version is reviewed before it can be enabled. */
export async function updateExtension(input: {
  id: string;
  manifest: unknown;
  moduleSource?: string | null;
}) {
  const client = await db();
  const cur = await client.from("extensions").select("*").eq("id", input.id).maybeSingle();
  const row = cur.data as ExtensionRow | null;
  if (!row) return { ok: false as const, error: "Unknown extension." };

  const hasModule = Boolean(input.moduleSource && input.moduleSource.trim());
  const checked = validateManifest(input.manifest, { hasModule });
  if (!checked.ok)
    return { ok: false as const, error: "This update was refused.", errors: checked.errors };
  if (hasModule) {
    const problems = scanModuleSource(input.moduleSource!);
    if (problems.length)
      return { ok: false as const, error: "This module was refused.", errors: problems };
  }

  await client
    .from("extensions")
    .update({
      name: checked.manifest.name,
      version: checked.manifest.version,
      purpose: checked.manifest.purpose,
      license: checked.manifest.license,
      requirements: checked.manifest.requirements ?? null,
      endpoint: checked.manifest.endpoint ?? null,
      needs_paid_service: Boolean(checked.manifest.needsPaidService),
      manifest: checked.manifest,
      module_source: hasModule ? input.moduleSource! : row.module_source,
      status: "validated",
      status_note: "Updated version awaiting a test. The previous version is kept for roll back.",
      previous_version: { manifest: row.manifest, module_source: row.module_source },
    })
    .eq("id", input.id);
  await logRun({ extensionId: input.id, version: checked.manifest.version, event: "updated" });
  return { ok: true as const, note: "Update staged. Test it before enabling it." };
}

export async function rollbackExtension(id: string) {
  const client = await db();
  const cur = await client.from("extensions").select("*").eq("id", id).maybeSingle();
  const row = cur.data as ExtensionRow | null;
  if (!row) return { ok: false as const, error: "Unknown extension." };
  if (!row.previous_version)
    return { ok: false as const, error: "There is no previous version to return to." };
  const prev = row.previous_version;
  await client
    .from("extensions")
    .update({
      name: prev.manifest.name,
      version: prev.manifest.version,
      purpose: prev.manifest.purpose,
      license: prev.manifest.license,
      manifest: prev.manifest,
      module_source: prev.module_source,
      status: "validated",
      status_note: "Rolled back to the previous version. Test it before enabling it.",
      previous_version: null,
    })
    .eq("id", id);
  await logRun({ extensionId: id, version: prev.manifest.version, event: "rolled_back" });
  return { ok: true as const };
}

/** Removes an extension. User projects and exported results are untouched. */
export async function removeExtension(id: string) {
  const client = await db();
  const cur = await client.from("extensions").select("builtin, version").eq("id", id).maybeSingle();
  if (!cur.data) return { ok: false as const, error: "Unknown extension." };
  if ((cur.data as { builtin: boolean }).builtin)
    return { ok: false as const, error: "A bundled extension can be disabled but not removed." };
  await client.from("extensions").delete().eq("id", id);
  return { ok: true as const };
}
