/**
 * Self-hosted photogrammetry jobs (Meshroom / AliceVision).
 *
 * Photographs are uploaded to private project storage, a job row is created in
 * `recon_jobs`, and a companion worker running on the administrator's own
 * computer polls this backend over outbound HTTPS, claims one job at a time,
 * downloads the photographs with short-lived signed URLs, runs Meshroom and
 * uploads the resulting textured model back.
 *
 * No paid reconstruction API is involved. When no worker has checked in
 * recently the job simply stays `queued` and the app reports the processing
 * computer as offline — a failed reconstruction is never replaced by a
 * generated or sample model.
 */

const enc = new TextEncoder();

/** A worker is considered online when it checked in within this window. */
export const WORKER_ONLINE_MS = 90 * 1000;
/** A claimed job whose worker stops sending heartbeats is returned to the queue. */
export const CLAIM_STALE_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "canceled";

export type JobRow = {
  id: string;
  owner_key: string;
  owner_label: string | null;
  project_name: string | null;
  scale_reference: string | null;
  status: JobStatus;
  stage: string | null;
  progress: number;
  photo_paths: string[];
  photo_count: number;
  model_path: string | null;
  formats: Record<string, string>;
  error: string | null;
  log: string | null;
  attempts: number;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  canceled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkerRow = {
  id: string;
  label: string;
  token_hash: string;
  token_prefix: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  host: string | null;
  meshroom_version: string | null;
  created_at: string;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Worker tokens are high-entropy random strings, stored only as a SHA-256 digest. */
export async function hashToken(token: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(token.trim())));
}

/* ————————————————— worker credentials ————————————————— */

export async function issueWorkerCredential(label: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `atw_${[...bytes]
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 48)}`;
  const client = await db();
  const res = await client
    .from("worker_credentials")
    .insert({
      label: label.slice(0, 80),
      token_hash: await hashToken(token),
      token_prefix: token.slice(0, 10),
    })
    .select("id, label, token_prefix, created_at")
    .single();
  if (res.error) throw new Error(res.error.message);
  // The token is returned once, to the administrator only, and never stored.
  return { credential: res.data, token };
}

export async function listWorkerCredentials() {
  const client = await db();
  const res = await client
    .from("worker_credentials")
    .select("id, label, token_prefix, revoked_at, last_seen_at, host, meshroom_version, created_at")
    .order("created_at", { ascending: false });
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];
  return rows.map((r) => ({
    ...r,
    online: Boolean(
      r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < WORKER_ONLINE_MS,
    ),
  }));
}

export async function revokeWorkerCredential(id: string) {
  const client = await db();
  const res = await client
    .from("worker_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (res.error) throw new Error(res.error.message);
}

/** Resolves the worker identified by a bearer token; revoked tokens fail. */
export async function authenticateWorker(request: Request): Promise<WorkerRow | null> {
  const raw = request.headers.get("authorization") ?? "";
  const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
  if (token.length < 16) return null;
  const client = await db();
  const res = await client
    .from("worker_credentials")
    .select("*")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  const row = res.data as WorkerRow | null;
  if (!row || row.revoked_at) return null;
  return row;
}

export async function touchWorker(
  id: string,
  info?: { host?: string | null; meshroomVersion?: string | null },
) {
  const client = await db();
  await client
    .from("worker_credentials")
    .update({
      last_seen_at: new Date().toISOString(),
      ...(info?.host ? { host: info.host.slice(0, 120) } : {}),
      ...(info?.meshroomVersion ? { meshroom_version: info.meshroomVersion.slice(0, 80) } : {}),
    })
    .eq("id", id);
}

/** True when at least one non-revoked worker checked in recently. */
export async function anyWorkerOnline() {
  const client = await db();
  const res = await client
    .from("worker_credentials")
    .select("last_seen_at")
    .is("revoked_at", null)
    .gt("last_seen_at", new Date(Date.now() - WORKER_ONLINE_MS).toISOString())
    .limit(1);
  return (res.data ?? []).length > 0;
}

/* ————————————————— job creation ————————————————— */

const DATA_URL = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

function decodeDataUrl(value: string) {
  const m = DATA_URL.exec(value.trim());
  if (!m) return null;
  const binary = atob(m[2] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, ext: m[1] === "png" ? "png" : "jpg", type: `image/${m[1]}` };
}

export async function createJob(input: {
  ownerKey: string;
  ownerLabel?: string | null;
  images: string[];
  projectName?: string | undefined;
  scaleReference?: string | undefined;
}) {
  const client = await db();
  const created = await client
    .from("recon_jobs")
    .insert({
      owner_key: input.ownerKey,
      owner_label: input.ownerLabel ?? null,
      project_name: input.projectName ?? null,
      scale_reference: input.scaleReference ?? null,
      status: "queued",
      stage: "Waiting for the processing computer",
      photo_count: input.images.length,
    })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  const jobId = created.data.id as string;

  const paths: string[] = [];
  for (let i = 0; i < input.images.length; i++) {
    const decoded = decodeDataUrl(input.images[i] ?? "");
    if (!decoded) {
      await client.from("recon_jobs").delete().eq("id", jobId);
      return { ok: false as const, error: "Only JPEG and PNG photographs can be uploaded." };
    }
    const path = `${jobId}/${String(i + 1).padStart(3, "0")}.${decoded.ext}`;
    const up = await client.storage
      .from("recon-photos")
      .upload(path, decoded.bytes, { contentType: decoded.type, upsert: true });
    if (up.error) {
      await client.from("recon_jobs").delete().eq("id", jobId);
      return {
        ok: false as const,
        error: `Photograph ${i + 1} could not be stored: ${up.error.message}`,
      };
    }
    paths.push(path);
  }

  const upd = await client
    .from("recon_jobs")
    .update({ photo_paths: paths, updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (upd.error) throw new Error(upd.error.message);
  return { ok: true as const, jobId };
}

/* ————————————————— owner-facing reads ————————————————— */

export async function jobForOwner(id: string, ownerKey: string) {
  const client = await db();
  const res = await client.from("recon_jobs").select("*").eq("id", id).maybeSingle();
  const row = res.data as JobRow | null;
  if (!row) return null;
  if (row.owner_key !== ownerKey && ownerKey !== "administrator") return null;
  return row;
}

export async function listJobs(ownerKey: string) {
  const client = await db();
  const query = client
    .from("recon_jobs")
    .select(
      "id, project_name, owner_label, status, stage, progress, photo_count, error, created_at, completed_at, claimed_at, heartbeat_at",
    )
    .order("created_at", { ascending: false })
    .limit(30);
  const res = ownerKey === "administrator" ? await query : await query.eq("owner_key", ownerKey);
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

/** Short-lived signed URL for the finished model, issued only to its owner. */
export async function signedModelUrl(path: string, seconds = 3600) {
  const client = await db();
  const res = await client.storage.from("recon-models").createSignedUrl(path, seconds);
  return res.data?.signedUrl ?? null;
}

export async function cancelJob(id: string, ownerKey: string) {
  const row = await jobForOwner(id, ownerKey);
  if (!row) return { ok: false as const, error: "Job not found." };
  if (row.status === "completed")
    return { ok: false as const, error: "This reconstruction has already finished." };
  const client = await db();
  await client
    .from("recon_jobs")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      stage: "Canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return { ok: true as const };
}

/* ————————————————— worker-facing operations ————————————————— */

/** Returns stale claims to the queue so an interrupted worker loses nothing. */
async function requeueStale() {
  const client = await db();
  const cutoff = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  await client
    .from("recon_jobs")
    .update({
      status: "queued",
      claimed_by: null,
      claimed_at: null,
      stage: "Requeued after the processing computer stopped responding",
      progress: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("heartbeat_at", cutoff)
    .lt("attempts", MAX_ATTEMPTS);

  await client
    .from("recon_jobs")
    .update({
      status: "failed",
      error: "Reconstruction was interrupted repeatedly and stopped after the retry limit.",
      stage: "Failed",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("heartbeat_at", cutoff)
    .gte("attempts", MAX_ATTEMPTS);
}

/**
 * Atomically claims the oldest queued job for one worker. The conditional
 * update on `status = 'queued'` makes duplicate claims impossible: a second
 * worker updating the same row matches no rows and simply polls again.
 */
export async function claimJob(workerId: string) {
  await requeueStale();
  const client = await db();
  const candidates = await client
    .from("recon_jobs")
    .select("id, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(5);
  for (const candidate of candidates.data ?? []) {
    const now = new Date().toISOString();
    const claimed = await client
      .from("recon_jobs")
      .update({
        status: "processing",
        claimed_by: workerId,
        claimed_at: now,
        heartbeat_at: now,
        attempts: (candidate.attempts as number) + 1,
        stage: "Claimed by the processing computer",
        progress: 1,
        error: null,
        updated_at: now,
      })
      .eq("id", candidate.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();
    const row = claimed.data as JobRow | null;
    if (!row) continue;

    const photos: { name: string; url: string }[] = [];
    for (const path of row.photo_paths) {
      const signed = await client.storage.from("recon-photos").createSignedUrl(path, 6 * 3600);
      if (signed.data?.signedUrl)
        photos.push({ name: path.split("/").pop() ?? path, url: signed.data.signedUrl });
    }
    return {
      job: {
        id: row.id,
        projectName: row.project_name,
        scaleReference: row.scale_reference,
        attempt: row.attempts,
        photos,
      },
    };
  }
  return { job: null };
}

export async function workerProgress(
  workerId: string,
  jobId: string,
  patch: { stage?: string; progress?: number; log?: string },
) {
  const client = await db();
  const res = await client
    .from("recon_jobs")
    .update({
      heartbeat_at: new Date().toISOString(),
      ...(patch.stage ? { stage: patch.stage.slice(0, 200) } : {}),
      ...(typeof patch.progress === "number"
        ? { progress: Math.max(0, Math.min(100, Math.round(patch.progress))) }
        : {}),
      ...(patch.log ? { log: patch.log.slice(-8000) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("claimed_by", workerId)
    .select("status")
    .maybeSingle();
  const status = (res.data?.status as JobStatus | undefined) ?? null;
  // The worker uses this to stop early when the owner canceled the job.
  return { status, canceled: status === "canceled" };
}

/** A one-time signed upload URL so the worker never needs storage credentials. */
export async function modelUploadTicket(
  workerId: string,
  jobId: string,
  ext: "glb" | "obj" | "zip",
) {
  const client = await db();
  const owns = await client
    .from("recon_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("claimed_by", workerId)
    .maybeSingle();
  if (!owns.data) return null;
  const path = `${jobId}/model.${ext}`;
  const signed = await client.storage.from("recon-models").createSignedUploadUrl(path);
  if (signed.error || !signed.data) return null;
  return { path, uploadUrl: signed.data.signedUrl, token: signed.data.token };
}

/**
 * A path a worker reports must sit inside that job's own folder.
 *
 * `modelPath` and the `formats` map arrive from the worker and are handed
 * straight to `createSignedUrl`, so without this a worker could point one job
 * at another job's model — or at any other object in the bucket — and the
 * owner-scoped status endpoint would happily sign it.
 */
function pathBelongsToJob(jobId: string, path: string) {
  return (
    typeof path === "string" &&
    path.startsWith(`${jobId}/`) &&
    !path.includes("..") &&
    !path.includes("\\") &&
    !path.startsWith("/") &&
    path.length <= 300
  );
}

export async function completeJob(
  workerId: string,
  jobId: string,
  input: { modelPath: string; formats?: Record<string, string>; log?: string },
) {
  if (!pathBelongsToJob(jobId, input.modelPath)) return false;
  const formats = Object.fromEntries(
    Object.entries(input.formats ?? {}).filter(([, p]) => pathBelongsToJob(jobId, p)),
  );
  const client = await db();
  const now = new Date().toISOString();
  const res = await client
    .from("recon_jobs")
    .update({
      status: "completed",
      stage: "Completed",
      progress: 100,
      model_path: input.modelPath,
      formats,
      completed_at: now,
      heartbeat_at: now,
      updated_at: now,
      ...(input.log ? { log: input.log.slice(-8000) } : {}),
    })
    .eq("id", jobId)
    .eq("claimed_by", workerId)
    .select("id")
    .maybeSingle();
  return Boolean(res.data);
}

export async function failJob(
  workerId: string,
  jobId: string,
  input: { error: string; log?: string; retry?: boolean },
) {
  const client = await db();
  const current = await client
    .from("recon_jobs")
    .select("attempts")
    .eq("id", jobId)
    .eq("claimed_by", workerId)
    .maybeSingle();
  if (!current.data) return false;
  const attempts = (current.data.attempts as number) ?? 0;
  const retry = input.retry && attempts < MAX_ATTEMPTS;
  const now = new Date().toISOString();
  const res = await client
    .from("recon_jobs")
    .update({
      status: retry ? "queued" : "failed",
      stage: retry ? "Requeued for another attempt" : "Failed",
      progress: 0,
      error: input.error.slice(0, 1000),
      claimed_by: retry ? null : workerId,
      claimed_at: retry ? null : now,
      updated_at: now,
      ...(input.log ? { log: input.log.slice(-8000) } : {}),
    })
    .eq("id", jobId)
    .select("id")
    .maybeSingle();
  return Boolean(res.data);
}
