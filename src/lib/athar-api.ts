/** Browser-side calls to the protected Athar endpoints. Never handles the PIN hash. */

import type {
  ExplainLang,
  ReadingResult,
  ReferenceCollectionInfo,
  ReferenceParallel,
  ScriptChoice,
} from "./inscription-prompt";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await res.json().catch(() => ({}))) as T;
}

export const adminLogin = (password: string) =>
  post<{ ok: boolean; error?: string }>("/api/admin/login", { password });

export type WordEvidenceView = {
  token: string;
  occurrences: number;
  /** Expert-approved corrections shared by other users. */
  expertNotes?: {
    meaningAr: string | null;
    correctedReading: string;
    siglum: string | null;
    sourceNote: string | null;
  }[];
  arabic: string | null;
  english: string | null;
  examples: {
    siglum: string;
    script: string | null;
    transliteration: string | null;
    translation: string;
    translationAr: string | null;
    url: string | null;
  }[];
};

export const analyzeInscription = (payload: {
  originalDataUrl: string;
  enhancedDataUrl: string;
  extraDataUrls?: string[];
  script: ScriptChoice;
  lang: ExplainLang;
  userNote?: string;
  detectorHint?: {
    sequence: string;
    modelVersion: number;
    accuracy: number | null;
    letters: number;
  };
}) =>
  post<{
    ok: boolean;
    error?: string;
    reading?: ReadingResult;
    parallels?: ReferenceParallel[];
    referenceCollection?: ReferenceCollectionInfo | null;
    arabic?: "ready" | "setup_required" | "failed";
    lexiconNote?: string;
    citedSigla?: string[];
    words?: WordEvidenceView[];
  }>("/api/analyze", payload);

export const importReferences = (payload: { offset: number; limit: number }) =>
  post<{
    ok: boolean;
    error?: string;
    imported?: number;
    nextOffset?: number;
    done?: boolean;
    total?: number;
    source?: string;
    version?: string;
  }>("/api/admin/references/import", payload);

export async function referenceStatus() {
  const res = await fetch("/api/references/status", { credentials: "same-origin" });
  return (await res.json().catch(() => ({}))) as {
    ok: boolean;
    collection?: (ReferenceCollectionInfo & { licenseNote?: string; sourceUrl?: string }) | null;
  };
}

export const submitReconstruction = (payload: {
  images: string[];
  projectName?: string;
  scaleReference?: string;
}) =>
  post<{
    ok: boolean;
    configured: boolean;
    error?: string;
    jobId?: string;
    workerOnline?: boolean;
    note?: string;
  }>("/api/three-d/jobs", payload);

/**
 * Queues a reconstruction offline instead of losing it.
 *
 * The job runs for hours on the worker computer once it arrives, so leaving
 * an hour later costs nothing — which is exactly what makes it safe to queue
 * and inscription analysis not (see src/lib/outbox.ts).
 */
export async function submitReconstructionQueued(
  payload: Parameters<typeof submitReconstruction>[0],
  label: string,
): Promise<{ queued: true } | Awaited<ReturnType<typeof submitReconstruction>>> {
  const { enqueue, register } = await import("./outbox");
  register("reconstruction", async (body) => {
    try {
      const res = await submitReconstruction(body as Parameters<typeof submitReconstruction>[0]);
      if (res.ok) return { ok: true };
      // A 4xx-style rejection will not pass on the tenth try either.
      const permanent = Boolean(res.error) && res.configured !== false;
      return { ok: false, permanent, error: res.error ?? "Rejected" };
    } catch (err) {
      return { ok: false, permanent: false, error: err instanceof Error ? err.message : "Offline" };
    }
  });

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue("reconstruction", label, payload);
    return { queued: true };
  }

  try {
    return await submitReconstruction(payload);
  } catch {
    await enqueue("reconstruction", label, payload);
    return { queued: true };
  }
}

export const cancelReconstruction = (jobId: string) =>
  post<{ ok: boolean; error?: string }>("/api/three-d/jobs", { action: "cancel", jobId });

/** The caller's own reconstruction jobs, newest first. */
export const myReconstructionJobs = () =>
  post<{
    ok: boolean;
    error?: string;
    workerOnline?: boolean;
    jobs?: Array<{ id: string; status: string; created_at: string }>;
  }>("/api/three-d/jobs", { action: "list" });

export type ReconstructionJob = {
  status?: "queued" | "processing" | "completed" | "failed" | "canceled";
  stage?: string | null;
  progress?: number;
  photoCount?: number;
  attempts?: number;
  error?: string | null;
  log?: string | null;
  createdAt?: string;
  modelUrl?: string;
  formats?: Record<string, string>;
};

export async function reconstructionStatus(jobId: string) {
  const res = await fetch(`/api/three-d/status/${encodeURIComponent(jobId)}`, {
    credentials: "same-origin",
  });
  return (await res.json().catch(() => ({}))) as {
    ok: boolean;
    configured: boolean;
    workerOnline?: boolean;
    error?: string;
    job?: ReconstructionJob;
  };
}

/** Administrator-only: the processing computers allowed to run reconstructions. */
export type WorkerCredential = {
  id: string;
  label: string;
  token_prefix: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  host: string | null;
  meshroom_version: string | null;
  created_at: string;
  online: boolean;
};

/** Administrator-only: one reconstruction job and its current state. */
export type ReconJobSummary = {
  id: string;
  project_name: string | null;
  owner_label: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  stage: string | null;
  progress: number;
  photo_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
};

export const workerAdmin = (
  payload:
    | { action: "list" }
    | { action: "jobs" }
    | { action: "issue"; label: string }
    | { action: "revoke"; id: string },
) =>
  post<{
    ok: boolean;
    error?: string;
    workers?: WorkerCredential[];
    jobs?: ReconJobSummary[];
    credential?: { id: string; label: string; token_prefix: string; created_at: string };
    token?: string;
  }>("/api/admin/worker", payload);

export const lookupMeaning = (payload: {
  transliteration: string;
  script?: string;
  /** Interface language for the glosses; published English text is preserved. */
  lang?: "ar" | "en" | "zh" | "fr";
}) =>
  post<{
    ok: boolean;
    error?: string;
    state?: "matches" | "no_match" | "reference_required" | "no_transliteration";
    message?: string;
    collection?: { source: string; version: string; records: number } | null;
    parallels?: ReferenceParallel[];
    arabic?: "ready" | "setup_required" | "failed";
    words?: {
      token: string;
      occurrences: number;
      arabic: string | null;
      english: string | null;
      examples: {
        siglum: string;
        script: string | null;
        transliteration: string | null;
        translation: string;
        translationAr: string | null;
        url: string | null;
      }[];
    }[];
  }>("/api/references/lookup", payload);

/* ---------- on-device letter detection dataset ---------- */

import type { DatasetStats, Exemplar } from "./glyph-model";

export async function glyphExemplars(script: string) {
  const res = await fetch(`/api/glyphs/exemplars?script=${encodeURIComponent(script)}`, {
    credentials: "same-origin",
  });
  return (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    exemplars?: Exemplar[];
    stats?: DatasetStats;
  };
}

export const submitGlyphLabel = (payload: {
  script: "thamudic" | "dadanitic" | "nabataean" | "other";
  letter: string;
  transliteration?: string;
  features: number[];
  provenance?: string;
  notes?: string;
  appVersion?: string;
  consent: true;
}) =>
  post<{ ok: boolean; error?: string; state?: string; message?: string }>(
    "/api/glyphs/label",
    payload,
  );

export async function glyphDataset() {
  const res = await fetch("/api/glyphs/dataset", { credentials: "same-origin" });
  return (await res.json().catch(() => ({}))) as { ok?: boolean; stats?: DatasetStats[] };
}

export const glyphReview = (
  payload:
    | { action: "list"; script?: string }
    | { action: "decide"; ids: string[]; decision: "approved" | "rejected" }
    | { action: "evaluate"; script: string },
) =>
  post<{
    ok: boolean;
    error?: string;
    state?: string;
    message?: string;
    pending?: {
      id: string;
      script: string;
      letter: string;
      transliteration: string | null;
      provenance: string | null;
      notes: string | null;
      created_at: string;
    }[];
    updated?: number;
    accuracy?: number | null;
    exemplars?: number;
    letters?: number;
  }>("/api/admin/glyphs/review", payload);

/* ---------- trained letter model ---------- */

import type { ModelMetrics, TrainedModel } from "./glyph-training";

/** The activated model for one script, or an honest "training data required". */
export async function glyphModel(script: string) {
  const res = await fetch(`/api/glyphs/model?script=${encodeURIComponent(script)}`, {
    credentials: "same-origin",
  });
  return (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    model?: TrainedModel | null;
    stats?: DatasetStats;
    state?: "active" | "training_data_required";
  };
}

export const glyphTrain = (
  payload:
    | { action: "list"; script: string }
    | { action: "train"; script: string; provenance?: string }
    | { action: "activate"; script: string; version: number }
    | { action: "retire"; script: string },
) =>
  post<{
    ok: boolean;
    error?: string;
    state?: string;
    message?: string;
    version?: number;
    accuracy?: number | null;
    macroF1?: number | null;
    letters?: number;
    trainedOn?: number;
    approved?: number;
    metrics?: ModelMetrics;
    eligible?: boolean;
    reasons?: string[];
    versions?: {
      id: string;
      version: number;
      accuracy: number | null;
      macro_f1: number | null;
      letters: number;
      trained_on: number;
      status: string;
      created_at: string;
      activated_at: string | null;
    }[];
  }>("/api/admin/glyphs/train", payload);

/* ---------- documented-photograph corpus ---------- */

import type { CorpusImage } from "./corpus-types";

export async function corpusImages(script?: string) {
  const res = await fetch(
    `/api/corpus/images${script ? `?script=${encodeURIComponent(script)}` : ""}`,
    {
      credentials: "same-origin",
    },
  );
  return (await res.json().catch(() => ({}))) as { ok?: boolean; images?: CorpusImage[] };
}

export const corpusManage = (
  payload:
    | { action: "list"; script?: string }
    | {
        action: "add";
        title: string;
        siglum?: string;
        script: string;
        imageUrl: string;
        sourceUrl?: string;
        license: string;
        credit?: string;
        notes?: string;
      }
    | { action: "delete"; id: string }
    | {
        action: "label";
        id: string;
        signs: {
          letter: string;
          transliteration?: string;
          features: number[];
          bbox: { x: number; y: number; w: number; h: number };
          unknown: boolean;
        }[];
      },
) =>
  post<{
    ok: boolean;
    error?: string;
    detail?: string;
    images?: CorpusImage[];
    image?: CorpusImage;
    named?: number;
    unknown?: number;
  }>("/api/admin/corpus/manage", payload);

/* ---------------------------------------------------------------------------
 * Administrator: extensions & scripts. Every call is authorised on the server.
 * ------------------------------------------------------------------------- */

export type ExtensionRecord = {
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
  manifest: import("./extension-contract").ExtensionManifest;
  module_source: string | null;
  status: import("./extension-contract").ExtensionStatus;
  status_note: string | null;
  builtin: boolean;
  secret_name: string | null;
  last_test_at: string | null;
  last_test_note: string | null;
  previous_version: unknown | null;
  created_at: string;
  updated_at: string;
};

export type ExtensionRun = {
  id: string;
  extension_id: string;
  extension_version: string;
  event: string;
  detail: string | null;
  surface: string | null;
  duration_ms: number | null;
  created_at: string;
};

export const extensionsAdmin = (
  payload:
    | { action: "list" }
    | { action: "logs"; limit?: number }
    | { action: "import"; manifest: unknown; moduleSource?: string; secretName?: string }
    | {
        action: "register-source";
        name: string;
        sourceUrl: string;
        purpose: string;
        runtime: "browser" | "backend" | "external_worker";
        license: string;
        requirements?: string;
        endpoint?: string;
        needsPaidService?: boolean;
      }
    | { action: "record-test"; id: string; passed: boolean; note: string; durationMs?: number }
    | { action: "enable" | "disable" | "rollback" | "remove"; id: string }
    | { action: "update"; id: string; manifest: unknown; moduleSource?: string }
    | {
        action: "log";
        id: string;
        version: string;
        event: string;
        detail?: string;
        surface?: string;
        durationMs?: number;
      },
) =>
  post<{
    ok: boolean;
    error?: string;
    errors?: string[];
    note?: string;
    extensions?: ExtensionRecord[];
    extension?: ExtensionRecord;
    workerOnline?: boolean;
    runs?: ExtensionRun[];
  }>("/api/admin/extensions", payload);
