import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Download, Image as ImageIcon, Info, RefreshCw, Save, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ModelViewer } from "@/components/athar/ModelViewer";
import { CameraButton, type CapturedPhoto } from "./CameraCapture";
import {
  cancelReconstruction,
  myReconstructionJobs,
  reconstructionStatus,
  submitReconstructionQueued,
  type ReconstructionJob,
} from "@/lib/athar-api";
import { saveProject } from "@/lib/athar-db";
import { logActivity } from "@/lib/activity-log";
import {
  ANALYSIS_MAX_PIXELS,
  blobToDataUrl,
  canvasToBlob,
  fitScale,
  loadImageFromFile,
} from "@/lib/enhance-client";

type Shot = {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** Variance-of-Laplacian sharpness score and mean exposure. */
  sharpness: number;
  exposure: number;
};

function assess(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { sharpness: 0, exposure: 0 };
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4] ?? 0;
    const g = d[i * 4 + 1] ?? 0;
    const b = d[i * 4 + 2] ?? 0;
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = v;
    sum += v;
  }
  let mean = 0;
  let m2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * (gray[i] ?? 0) -
        (gray[i - 1] ?? 0) -
        (gray[i + 1] ?? 0) -
        (gray[i - w] ?? 0) -
        (gray[i + w] ?? 0);
      n++;
      const delta = lap - mean;
      mean += delta / n;
      m2 += delta * (lap - mean);
    }
  }
  return { sharpness: n ? m2 / n : 0, exposure: sum / (w * h) };
}

export function Capture3D() {
  const { t } = useI18n();
  const [shots, setShots] = useState<Shot[]>([]);
  /** Mirrors `shots` so the unmount cleanup sees the final list, not a stale closure. */
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [scaleRef, setScaleRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoStart, setAutoStart] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ReconstructionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);

  // Reopen the most recent reconstruction on mount, so a model that finished
  // while the app was closed is shown again in the 3D viewer.
  useEffect(() => {
    let stop = false;
    void (async () => {
      const res = await myReconstructionJobs();
      if (stop || !res.ok) return;
      const latest = (res.jobs ?? [])[0];
      if (latest) {
        setJobId((current) => current ?? latest.id);
        setWorkerOnline(res.workerOnline ?? null);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  const makeShot = async (c: HTMLCanvasElement): Promise<Shot> => {
    const metrics = assess(c);
    const blob = await canvasToBlob(c, 0.9);
    return {
      id: crypto.randomUUID(),
      blob,
      url: URL.createObjectURL(blob),
      width: c.width,
      height: c.height,
      ...metrics,
    };
  };

  // Every captured frame holds a blob URL for its thumbnail. Release them when
  // the screen goes away, or a long capture session keeps every frame alive.
  useEffect(
    () => () => {
      for (const s of shotsRef.current) URL.revokeObjectURL(s.url);
    },
    [],
  );

  const addCanvas = async (c: HTMLCanvasElement) => {
    const shot = await makeShot(c);
    setShots((s) => [...s, shot]);
  };

  /**
   * Photographs coming back from the managed camera screen. When automatic
   * start is on and there are at least two overlapping photographs, the
   * reconstruction job is queued immediately so its progress shows up in the
   * jobs page without a second tap.
   */
  const addPhotos = async (photos: CapturedPhoto[]) => {
    const added: Shot[] = [];
    for (const p of photos) {
      const img = new Image();
      img.src = p.dataUrl;
      try {
        await img.decode();
      } catch {
        continue;
      }
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0);
      added.push(await makeShot(c));
    }
    if (!added.length) return;
    const next = [...shots, ...added];
    setShots(next);
    if (autoStart && next.length >= 2) await submit(next);
  };

  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 80)) {
      if (!["image/jpeg", "image/png"].includes(f.type)) {
        toast.error(t("cap3d.skipped", { file: f.name }));
        continue;
      }
      try {
        const img = await loadImageFromFile(f);
        const c = document.createElement("canvas");
        const s = fitScale(img.naturalWidth, img.naturalHeight, ANALYSIS_MAX_PIXELS * 2);
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
        await addCanvas(c);
      } catch {
        toast.error(t("cap3d.unreadable", { file: f.name }));
      }
    }
  };

  const blurry = shots.filter((s) => s.sharpness < 40);
  const dark = shots.filter((s) => s.exposure < 45);
  const bright = shots.filter((s) => s.exposure > 225);

  const submit = async (list: Shot[] = shots) => {
    setBusy(true);
    setError(null);
    logActivity({
      type: "reconstruction_started",
      title: "Processing started",
      details: `3D scan reconstruction (${list.length} photos) queued`,
      status: "pending",
    });
    try {
      const images: string[] = [];
      for (const s of list) images.push(await blobToDataUrl(s.blob));
      const res = await submitReconstructionQueued(
        {
          images,
          ...(name.trim() ? { projectName: name.trim() } : {}),
          ...(scaleRef.trim() ? { scaleReference: scaleRef.trim() } : {}),
        },
        name.trim() || t("cap3d.untitled"),
      );
      // Offline: the photographs are safely in the queue, so this is a
      // success from the recorder's point of view, not a failure.
      if ("queued" in res) {
        toast.success(t("ob.queued"));
        return;
      }
      setConfigured(res.configured);
      if (!res.ok || !res.jobId) {
        setError(res.error ?? t("cap3d.submitFailed"));
        return;
      }
      setWorkerOnline(res.workerOnline ?? null);
      setJobId(res.jobId);
      if (res.note) toast.success(res.note);
    } catch {
      setError(t("cap3d.offlineSubmit"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const poll = async () => {
      const res = await reconstructionStatus(jobId);
      if (stop) return;
      if (!res.ok) setError(res.error ?? t("cap3d.statusFailed"));
      else if (res.job) {
        setJob(res.job);
        setWorkerOnline(res.workerOnline ?? null);
        if (
          res.job.status === "completed" ||
          res.job.status === "failed" ||
          res.job.status === "canceled"
        )
          return;
      }
      setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [jobId]);

  const saveLocal = async () => {
    try {
      await saveProject({
        id: crypto.randomUUID(),
        kind: "object",
        name: name.trim() || t("cap3d.untitled"),
        notes,
        createdAt: Date.now(),
        captures: shots.map((s) => s.blob),
        versions: [],
        annotations: [],
        machineReading: null,
        ...(jobId ? { jobId } : {}),
        ...(job?.modelUrl ? { modelUrl: job.modelUrl } : {}),
        serverSide: !!jobId,
        consentToShare: false,
      });
      toast.success(t("cap3d.savedLocal"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cap3d.saveFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="mb-2 text-lg font-bold">{t("cap3d.guidance")}</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("cap3d.tip1")}</li>
          <li>{t("cap3d.tip2")}</li>
          <li>{t("cap3d.tip3")}</li>
          <li>{t("cap3d.tip4")}</li>
          <li>{t("cap3d.tip5")}</li>
        </ul>
      </section>

      <section className="panel p-4">
        <div className="grid grid-cols-2 gap-3">
          <CameraButton
            mode="object3d"
            label={t("cap3d.openCamera")}
            onPhotos={(photos) => void addPhotos(photos)}
          />
          <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()}>
            <ImageIcon /> {t("cap3d.upload")}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <Label htmlFor="auto-start" className="text-sm">
            {t("cap3d.autoStart")}
          </Label>
          <Switch id="auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t("cap3d.autoStartHint")}</p>

        <p className="mt-3 text-sm">
          {t("cap3d.count", { count: shots.length })}
          {shots.length < 2 && ` ${t("cap3d.needTwo")}`}
          {shots.length >= 2 && shots.length < 20 && ` ${t("cap3d.needMore")}`}
        </p>
        {(blurry.length > 0 || dark.length > 0 || bright.length > 0) && (
          <p className="mt-2 flex gap-2 rounded-lg bg-warn p-3 text-sm text-warn-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {blurry.length > 0 && `${t("cap3d.blurry", { count: blurry.length })} `}
              {dark.length > 0 && `${t("cap3d.dark", { count: dark.length })} `}
              {bright.length > 0 && `${t("cap3d.bright", { count: bright.length })} `}
            </span>
          </p>
        )}
        {shots.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {shots.map((s) => (
              <div key={s.id} className="relative">
                <img
                  src={s.url}
                  alt={t("cap3d.captureView")}
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(s.url);
                    setShots((p) => p.filter((x) => x.id !== s.id));
                  }}
                  className="absolute end-1 top-1 rounded-md bg-card/90 p-1"
                  aria-label={t("cap3d.remove")}
                >
                  <Trash2 className="size-4" />
                </button>
                {s.sharpness < 40 && (
                  <span className="absolute bottom-1 start-1 rounded bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {t("cap3d.blurredTag")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="mb-2 text-lg font-bold">{t("cap3d.reconstruct")}</h2>
        <Label htmlFor="obj-name">{t("cap3d.projectName")}</Label>
        <Input
          id="obj-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2"
        />
        <Label htmlFor="scale" className="mt-3 block">
          {t("cap3d.scaleRef")}
        </Label>
        <Input
          id="scale"
          placeholder={t("cap3d.scalePlaceholder")}
          value={scaleRef}
          onChange={(e) => setScaleRef(e.target.value)}
          className="mt-2"
        />
        <Label htmlFor="obj-notes" className="mt-3 block">
          {t("cap3d.notes")}
        </Label>
        <Textarea
          id="obj-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-2"
        />
        <p className="mt-3 flex gap-2 rounded-lg bg-warn p-3 text-sm text-warn-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{t("cap3d.submitNote")}</span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button size="lg" onClick={() => void submit()} disabled={busy || shots.length < 2}>
            <Send /> {busy ? t("cap3d.submitting") : t("cap3d.submit")}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => void saveLocal()}
            disabled={!shots.length}
          >
            <Save /> {t("cap3d.saveLocally")}
          </Button>
        </div>
        {shots.length === 1 && (
          <p className="mt-2 text-sm text-muted-foreground">{t("cap3d.onePhoto")}</p>
        )}

        {error && (
          <div className="mt-3 space-y-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <p>{error}</p>
            {!configured ? (
              <p className="text-muted-foreground">{t("cap3d.notUploaded")}</p>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void submit()}>
                <RefreshCw /> {t("cap3d.retry")}
              </Button>
            )}
          </div>
        )}

        {jobId && (
          <div className="mt-4 space-y-2">
            <p className="text-sm">
              {t("cap3d.job")} <code dir="ltr">{jobId}</code> —{" "}
              {job?.stage ??
                (job?.status ? t(`cap3d.status.${job.status}`) : t("cap3d.status.queued"))}
              {typeof job?.progress === "number" ? ` · ${Math.round(job.progress)}%` : ""}
            </p>
            {job?.status === "queued" && workerOnline === false && (
              <p className="rounded-lg bg-warn p-3 text-sm text-warn-foreground">
                {t("cap3d.workerOffline")}
              </p>
            )}
            {typeof job?.progress === "number" && job.progress > 0 ? (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${job.progress}%` }} />
              </div>
            ) : (
              <div className="h-2 animate-pulse rounded-full bg-muted" />
            )}
            {job?.error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {job.error}
                {job.attempts ? ` (${t("cap3d.attempt", { n: job.attempts })})` : ""}
              </p>
            )}
            {job && job.status !== "completed" && job.status !== "canceled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const res = await cancelReconstruction(jobId);
                  if (!res.ok) toast.error(res.error ?? t("cap3d.cancelFailed"));
                  else toast.success(t("cap3d.canceled"));
                }}
              >
                <Trash2 /> {t("cap3d.cancel")}
              </Button>
            )}
            {job?.modelUrl && (
              <div className="space-y-3">
                <ModelViewer src={job.modelUrl} />
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={job.modelUrl} download>
                      <Download /> {t("cap3d.downloadModel")}
                    </a>
                  </Button>
                  {Object.entries(job.formats ?? {}).map(([fmt, url]) => (
                    <Button key={fmt} asChild variant="ghost">
                      <a href={url} download>
                        <Download /> {fmt.toUpperCase()}
                      </a>
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("cap3d.modelNote")}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
