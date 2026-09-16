import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { shareCorrection } from "@/lib/corrections-client";
import {
  Boxes,
  Camera,
  Crop,
  Download,
  Hand,
  Image as ImageIcon,
  Info,
  Plus,
  RefreshCw,
  RotateCw,
  Ruler,
  Save,
  ScrollText,
  Undo2,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BeforeAfter } from "@/components/athar/BeforeAfter";
import { MeasureCanvas } from "@/components/athar/MeasureCanvas";
import { LetterDetector, type DetectorHint } from "@/components/athar/LetterDetector";
import {
  ANALYSIS_MAX_PIXELS,
  MAX_EXPORT_PIXELS,
  PREVIEW_MAX_PIXELS,
  blobToDataUrl,
  canvasFromImageData,
  canvasToBlob,
  cropCanvas,
  decorrelationStretchFast,
  enhanceImageData,
  fitScale,
  imageDataOf,
  loadImageFromFile,
  type EnhanceMode,
  type EnhanceParams,
} from "@/lib/enhance-client";
import { analyzeInscription, type WordEvidenceView } from "@/lib/athar-api";
import {
  REFERENCE_SOURCES,
  type ExplainLang,
  type ReadingResult,
  type ReferenceCollectionInfo,
  type ReferenceParallel,
  type ScriptChoice,
} from "@/lib/inscription-prompt";
import { saveProject, type Annotation, type ReadingVersion } from "@/lib/athar-db";
import { logActivity } from "@/lib/activity-log";
import { downloadBlob } from "@/lib/object-url";
import type { MeasurementSet } from "@/lib/measure";
import { LANGS, useI18n } from "@/lib/i18n";
import { OnDevice3DEngine } from "@/lib/on-device-3d";
import { Server3DService } from "@/lib/server-3d-api";

import { CameraButton, type CapturedPhoto } from "./CameraCapture";

type Rect = { x: number; y: number; w: number; h: number };

const SCRIPTS: { id: ScriptChoice; label: string }[] = [
  { id: "auto", label: "Suggest script" },
  { id: "thamudic", label: "Thamudic" },
  { id: "dadanitic", label: "Dadanitic / Lihyanite" },
  { id: "nabataean", label: "Nabataean" },
  { id: "other", label: "Other / Unknown" },
];

const DEFAULTS: Record<EnhanceMode, EnhanceParams> = {
  pigments: { strength: 0.6, clipLimit: 2, sharpen: 0, denoise: false, grayscale: false },
  carved: { strength: 0.8, clipLimit: 3, sharpen: 0.4, denoise: true, grayscale: false },
};

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-warn p-3 text-sm leading-relaxed text-warn-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Field({ label, value, rtl }: { label: string; value: string; rtl?: boolean }) {
  return (
    <div className="border-t border-border pt-3 first:border-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 whitespace-pre-wrap leading-relaxed"
        dir={rtl ? "rtl" : "ltr"}
        lang={rtl ? "ar" : "en"}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export function Workspace({ intent }: { intent: "enhance" | "read" }) {
  /* source */
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [extra, setExtra] = useState<HTMLImageElement[]>([]);
  const [rotation, setRotation] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);

  /* selection */
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [sel, setSel] = useState<Rect | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const cachedBaseDataRef = useRef<ImageData | null>(null);

  /* enhancement */
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [isProcessing3D, setIsProcessing3D] = useState(false);
  const isLockedRef = useRef(false);
  const engine3DRef = useRef<OnDevice3DEngine | null>(null);
  const server3DRef = useRef<Server3DService>(new Server3DService());
  const canvas2DRef = useRef<HTMLCanvasElement | null>(null);
  const canvas3DRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<EnhanceMode>("carved");
  const [params, setParams] = useState<EnhanceParams>(DEFAULTS.carved);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  /**
   * The enhanced preview as a blob, kept because the measuring canvas needs
   * the pixels and not just a URL — and because measurement points are stored
   * against this exact rendering.
   */
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const [measurements, setMeasurements] = useState<MeasurementSet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<string | null>(null);

  /* reading */
  const [showRead, setShowRead] = useState(intent === "read");
  const [script, setScript] = useState<ScriptChoice>("auto");
  const { t, lang: uiLang } = useI18n();
  const [lang, setLang] = useState<ExplainLang>(uiLang);
  const [reading, setReading] = useState<ReadingResult | null>(null);
  const [parallels, setParallels] = useState<ReferenceParallel[]>([]);
  const [words, setWords] = useState<WordEvidenceView[]>([]);
  const [lexiconNote, setLexiconNote] = useState("");
  const [refCollection, setRefCollection] = useState<ReferenceCollectionInfo | null>(null);
  const [versions, setVersions] = useState<ReadingVersion[]>([]);
  const [userReading, setUserReading] = useState("");
  const [reason, setReason] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotLabel, setAnnotLabel] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  /* project */
  const [projName, setProjName] = useState("");
  const [notes, setNotes] = useState("");
  // Advisory sequence from the on-device trained model, attached only on request.
  const [detectorHint, setDetectorHint] = useState<DetectorHint | null>(null);
  const [consent, setConsent] = useState(false);

  const rotated = useMemo(() => {
    if (!img) return null;
    const swap = rotation % 180 !== 0;
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const s = fitScale(sw, sh, MAX_EXPORT_PIXELS);
    const w = Math.round((swap ? sh : sw) * s);
    const h = Math.round((swap ? sw : sh) * s);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.translate(w / 2, h / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, (-sw * s) / 2, (-sh * s) / 2, sw * s, sh * s);
    return c;
  }, [img, rotation]);

  const displayScale = useMemo(() => {
    if (!rotated) return 1;
    return Math.min(1, 720 / rotated.width) * zoom;
  }, [rotated, zoom]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !rotated) return;
    const w = Math.round(rotated.width * displayScale);
    const h = Math.round(rotated.height * displayScale);
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(rotated, 0, 0, w, h);
  }, [rotated, displayScale]);

  const resetAll = () => {
    cachedBaseDataRef.current = null;
    setSel(null);
    setBeforeUrl(null);
    setAfterUrl(null);
    setReading(null);
    setVersions([]);
    setUserReading("");
    setReadError(null);
    setExportInfo(null);
    setAnnotations([]);
    setZoom(1);
    setRotation(0);
  };

  /** Photographs handed over by the managed camera screen. */
  const acceptPhotos = async (photos: CapturedPhoto[]) => {
    const first = photos[0];
    if (!first) return;
    const el = new Image();
    await new Promise<void>((res, rej) => {
      el.onload = () => res();
      el.onerror = () => rej(new Error("decode failed"));
      el.src = first.dataUrl;
    }).catch(() => {
      toast.error("That photograph could not be opened.");
    });
    if (!el.naturalWidth) return;
    resetAll();
    setImg(el);
    // Extra photographs from the same session become the lighting variants.
    const rest: HTMLImageElement[] = [];
    for (const p of photos.slice(1, 4)) {
      const e = new Image();
      e.src = p.dataUrl;
      rest.push(e);
    }
    if (rest.length) setExtra(rest);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return null;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error(
        `Unsupported format "${file.type || "unknown"}". Athar supports JPEG and PNG only.`,
      );
      return null;
    }
    try {
      return await loadImageFromFile(file);
    } catch {
      toast.error("That image could not be opened. Try another file.");
      return null;
    }
  };

  const pickMain = async (file: File | undefined) => {
    const el = await readFile(file);
    if (el) {
      resetAll();
      setImg(el);
    }
  };

  const pickExtra = async (files: FileList | null) => {
    if (!files) return;
    const loaded: HTMLImageElement[] = [];
    for (const f of Array.from(files).slice(0, 3)) {
      const el = await readFile(f);
      if (el) loaded.push(el);
    }
    if (loaded.length) setExtra((p) => [...p, ...loaded].slice(0, 3));
  };

  /* selection dragging */
  const toSource = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (clientX - r.left) / displayScale, y: (clientY - r.top) / displayScale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!rotated) return;
    if (tool === "pan") {
      dragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSource(e.clientX, e.clientY);
    dragRef.current = p;
    setSel({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start || !rotated) return;
    if (tool === "pan") {
      const el = viewRef.current;
      if (el) {
        el.scrollLeft -= e.clientX - start.x;
        el.scrollTop -= e.clientY - start.y;
      }
      dragRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const p = toSource(e.clientX, e.clientY);
    setSel({
      x: Math.max(0, Math.min(start.x, p.x)),
      y: Math.max(0, Math.min(start.y, p.y)),
      w: Math.min(rotated.width, Math.abs(p.x - start.x)),
      h: Math.min(rotated.height, Math.abs(p.y - start.y)),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setSel((s) => (s && (s.w < 24 || s.h < 24) ? null : s));
  };

  const effectiveRect = useCallback((): Rect | null => {
    if (!rotated) return null;
    if (sel && sel.w > 24 && sel.h > 24) return sel;
    return { x: 0, y: 0, w: rotated.width, h: rotated.height };
  }, [rotated, sel]);

  const runPreview = useCallback(async () => {
    const rect = effectiveRect();
    if (!rotated || !rect) return;
    setBusy("Computing preview…");
    try {
      const s = fitScale(rect.w, rect.h, PREVIEW_MAX_PIXELS);
      const base = cropCanvas(rotated, rect.x, rect.y, rect.w, rect.h, s);
      const baseImg = imageDataOf(base);
      // الاحتفاظ بنسخة أساسية سريعة لتمكين الاستجابة اللحظية مع شريط الشدة
      cachedBaseDataRef.current = new ImageData(
        new Uint8ClampedArray(baseImg.data),
        baseImg.width,
        baseImg.height,
      );

      const enhanced = await enhanceImageData(baseImg, mode, params);
      const [beforeBlob, afterBlob] = await Promise.all([
        canvasToBlob(base, 0.9),
        canvasToBlob(canvasFromImageData(enhanced), 0.9),
      ]);
      // Each slider step re-runs this. Release the previous pair, otherwise
      // every adjustment strands two full-size blobs in memory for the
      // lifetime of the page.
      setBeforeUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(beforeBlob);
      });
      setAfterUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        const url = URL.createObjectURL(afterBlob);
        try {
          // حفظ الصورة المعززة كطبقة إكساء (Texture Map) للمجسم ثلاثي الأبعاد
          sessionStorage.setItem("athar_enhanced_texture_data", url);
        } catch (_err) {
          // Ignore storage quota
        }
        return url;
      });
      setPreviewBlob(afterBlob);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }, [effectiveRect, rotated, mode, params]);

  useEffect(() => {
    if (!rotated || !beforeUrl) return;

    // استجابة لحظية فائقة لشريط الشدة عبر الحساب المباشر لمعامل تضخيم التباين الذاتي
    if (cachedBaseDataRef.current) {
      const w = cachedBaseDataRef.current.width;
      const h = cachedBaseDataRef.current.height;
      const copy = new Uint8ClampedArray(cachedBaseDataRef.current.data);
      const filterMode = mode === "pigments" ? "crgb" : params.grayscale ? "yds" : "lds";
      decorrelationStretchFast(copy, params.strength, w, h, filterMode);

      const fastCanvas = document.createElement("canvas");
      fastCanvas.width = w;
      fastCanvas.height = h;
      const ctx = fastCanvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(new ImageData(copy, w, h), 0, 0);
        fastCanvas.toBlob(
          (b) => {
            if (b) {
              setAfterUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                const url = URL.createObjectURL(b);
                try {
                  sessionStorage.setItem("athar_enhanced_texture_data", url);
                } catch (_err) {
                  void _err;
                }
                return url;
              });
            }
          },
          "image/jpeg",
          0.85,
        );
      }
    }

    // تحديث دقيق في خيط الويب لمعايرة الدقة والقياسات
    const t = setTimeout(() => void runPreview(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, params.strength, params.clipLimit, params.sharpen, params.denoise, params.grayscale]);

  // تحديث محتوى الكانفاس الثنائي الدائم (2D Canvas) تلقائياً عند جاهزية الصورة المعززة
  useEffect(() => {
    if (!afterUrl || !canvas2DRef.current) return;
    const canvas2D = canvas2DRef.current;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas2D.width = img.naturalWidth || img.width;
      canvas2D.height = img.naturalHeight || img.height;
      const ctx = canvas2D.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = afterUrl;
  }, [afterUrl]);

  // دالة التجسيم الموحدة مع سباق الوقت (12s Timeout) والتحويل التلقائي للجوال
  const executeReconstruction = useCallback(async () => {
    if (isLockedRef.current) return;

    const canvas2D = canvas2DRef.current;
    const canvas3D = canvas3DRef.current;

    // 1. فحص سلامة عناصر الـ DOM
    if (!canvas2D || !canvas3D) {
      console.warn("الكانفاسات غير جاهزة في الواجهة بعد.");
      return;
    }

    // 2. التحقق من وجود صورة مرسومة بالفعل
    if (canvas2D.width === 0 || canvas2D.height === 0) {
      console.warn("الكانفاس الثنائي فارغ، يرجى التقاط أو تحديد صورة أولاً.");
      return;
    }

    if (!engine3DRef.current) {
      engine3DRef.current = new OnDevice3DEngine();
    }

    isLockedRef.current = true;
    setIsProcessing3D(true);

    try {
      // 3. سباق مع الوقت (Timeout 12s): إذا تأخر السيرفر عن 12 ثانية ينتقل تلقائياً لمحرك الجوال
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SERVER_TIMEOUT")), 12000),
      );

      const modelUrl = await Promise.race([
        server3DRef.current.generate3D(canvas2D),
        timeoutPromise,
      ]);

      // 4. عرض المجسم الحجمي 360° المستلم من السيرفر
      await engine3DRef.current.loadArtifactModel(canvas3D, modelUrl);
    } catch (error) {
      // 5. مسار الطوارئ الميداني (Offline / Timeout Fallback)
      console.warn("تم تفعيل التجسيم المحلي على معالج الجوال (Off-grid Fallback):", error);
      await engine3DRef.current.init(canvas3D, canvas2D, {
        reliefDepth: Math.max(0.05, Math.min(0.6, (params.strength || 0.8) * 0.28)),
        roughness: 0.85,
        metalness: 0.15,
        lightIntensity: 1.8,
      });
    } finally {
      setIsProcessing3D(false);
      isLockedRef.current = false;
    }
  }, [params.strength]);

  // تشغيل التجسيم تلقائياً بمجرد اختيار المستخدم نمط الـ 3D
  useEffect(() => {
    if (viewMode === "3d") {
      void executeReconstruction();
    }
  }, [viewMode, executeReconstruction]);

  // تحديث عمق النقر الحجري لحظياً عند تحريك شريط الشدة
  useEffect(() => {
    if (viewMode === "3d" && engine3DRef.current) {
      const depth = Math.max(0.05, Math.min(0.6, (params.strength || 0.8) * 0.28));
      engine3DRef.current.updateReliefDepth(depth);
    }
  }, [params.strength, viewMode]);

  // تفريغ ذاكرة الرسوميات عند إغلاق الشاشة
  useEffect(() => {
    return () => {
      if (engine3DRef.current) {
        engine3DRef.current.dispose();
        engine3DRef.current = null;
      }
    };
  }, []);

  const renderEnhanced = useCallback(
    async (maxPixels: number) => {
      const rect = effectiveRect();
      if (!rotated || !rect) throw new Error("No image loaded");
      const s = fitScale(rect.w, rect.h, maxPixels);
      const base = cropCanvas(rotated, rect.x, rect.y, rect.w, rect.h, s);
      const data = await enhanceImageData(imageDataOf(base), mode, params);
      return {
        base,
        enhanced: canvasFromImageData(data),
        reduced: s < 1,
        srcW: Math.round(rect.w),
        srcH: Math.round(rect.h),
      };
    },
    [effectiveRect, rotated, mode, params],
  );

  const exportEnhanced = async () => {
    setBusy("Exporting at the highest practical resolution…");
    try {
      const { enhanced, reduced, srcW, srcH } = await renderEnhanced(MAX_EXPORT_PIXELS);
      const blob = await canvasToBlob(enhanced, 0.95);
      downloadBlob(blob, `${projName || "athar"}-enhanced.jpg`);
      const info = `Exported ${enhanced.width}×${enhanced.height} px${
        reduced
          ? ` — reduced from ${srcW}×${srcH} px to stay within device memory limits.`
          : " — no resolution reduction."
      }`;
      setExportInfo(info);
      logActivity({
        type: "export_downloaded",
        title: "Enhanced image exported",
        details: `${projName || "athar"}-enhanced.jpg (${enhanced.width}×${enhanced.height} px)`,
        status: "success",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const doAnalyze = async () => {
    setBusy("Uploading the selected images and analysing… this can take a minute.");
    setReadError(null);
    logActivity({
      type: "reading_requested",
      title: "Processing started",
      details: `Inscription analysis requested (Script: ${script})`,
      status: "pending",
    });
    try {
      const { base, enhanced } = await renderEnhanced(ANALYSIS_MAX_PIXELS);
      const [o, e] = await Promise.all([
        canvasToBlob(base, 0.9).then(blobToDataUrl),
        canvasToBlob(enhanced, 0.9).then(blobToDataUrl),
      ]);
      const extras: string[] = [];
      for (const el of extra) {
        const c = document.createElement("canvas");
        const s = fitScale(el.naturalWidth, el.naturalHeight, ANALYSIS_MAX_PIXELS);
        c.width = Math.round(el.naturalWidth * s);
        c.height = Math.round(el.naturalHeight * s);
        c.getContext("2d")?.drawImage(el, 0, 0, c.width, c.height);
        extras.push(await blobToDataUrl(await canvasToBlob(c, 0.88)));
      }
      const res = await analyzeInscription({
        originalDataUrl: o,
        enhancedDataUrl: e,
        script,
        lang,
        ...(extras.length ? { extraDataUrls: extras } : {}),
        ...(notes.trim() ? { userNote: notes.trim() } : {}),
        ...(detectorHint ? { detectorHint } : {}),
      });
      if (!res.ok || !res.reading) {
        setReading(null);
        setParallels([]);
        setReadError(res.error ?? "Analysis failed.");
        return;
      }
      setReading(res.reading);
      setParallels(res.parallels ?? []);
      setWords(res.words ?? []);
      setLexiconNote(res.lexiconNote ?? "");
      setRefCollection(res.referenceCollection ?? null);
      logActivity({
        type: "reading_completed",
        title: "Reading completed",
        details: `Confidence: ${Math.round((res.reading.confidence ?? 0) * 100)}% · Script: ${res.reading.script}`,
        status: "success",
      });
      setVersions((v) => [
        ...v,
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          source: "machine",
          reading: res.reading as ReadingResult,
        },
      ]);
      if (!userReading) setUserReading(res.reading.proposedReading);
    } catch {
      setReadError("Could not reach the analysis service. Check your connection and retry.");
    } finally {
      setBusy(null);
    }
  };

  const saveCorrection = () => {
    if (!userReading.trim()) return;
    setVersions((v) => [
      ...v,
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        source: "user",
        text: userReading.trim(),
        reason: reason.trim(),
      },
    ]);
    setReason("");
    toast.success("Correction saved as a new version. The machine suggestion is kept separately.");
  };

  /**
   * Sends the correction for expert review so that, once approved, everyone sees
   * it as human evidence. Requires explicit consent and never publishes directly.
   */
  const shareForReview = async () => {
    if (!userReading.trim()) {
      toast.error("Write your corrected reading first.");
      return;
    }
    if (!consent) {
      toast.error("Turn on the reuse consent switch below before sharing.");
      return;
    }
    const res = await shareCorrection({
      script: script === "auto" ? "auto" : script,
      machineReading: reading?.proposedReading ?? undefined,
      correctedReading: userReading.trim(),
      reason: reason.trim() || undefined,
    });
    if (!res.ok) {
      toast.error(res.error ?? "Could not send the correction.");
      return;
    }
    toast.success("Sent for expert review. It stays private until an expert approves it.");
  };

  const undoLastCorrection = () => {
    setVersions((v) => {
      const last = [...v].reverse().find((x) => x.source === "user");
      return last ? v.filter((x) => x.id !== last.id) : v;
    });
  };

  const readingText = (r: ReadingResult) =>
    [
      `Suggested script: ${r.script}`,
      `Reading direction: ${r.direction}`,
      `Transliteration: ${r.transliteration}`,
      `Proposed reading: ${r.proposedReading}`,
      `Word segmentation: ${r.wordSplit}`,
      `Possible meaning (${r.meaningLang === "ar" ? "Arabic" : "English"}): ${r.meaning}`,
      `Uncertain characters: ${r.uncertainties}`,
      `Alternative readings: ${r.alternatives}`,
      r.note ? `Note: ${r.note}` : "",
      "References:",
      ...r.references.map((x) => `- ${x.title}: ${x.url}`),
      parallels.length
        ? `\nSimilar published inscriptions (comparanda, not verified matches):\n${parallels
            .map(
              (pl) =>
                `- ${pl.siglum} (${pl.script ?? "script not stated"}): ${pl.transliteration ?? ""}${pl.translation ? ` — ${pl.translation}` : ""}${pl.url ? ` [${pl.url}]` : ""}`,
            )
            .join("\n")}`
        : "",
      ...versions
        .filter((v) => v.source === "user")
        .map(
          (v) =>
            `\nUser correction (${new Date(v.createdAt).toISOString()}): ${v.text}${v.reason ? ` — reason: ${v.reason}` : ""}`,
        ),
      annotations.length
        ? `\nManual annotations:\n${annotations
            .map(
              (a) =>
                `- ${a.label} @ ${Math.round(a.x)},${Math.round(a.y)} ${Math.round(a.w)}×${Math.round(a.h)}`,
            )
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

  const downloadReading = () => {
    if (!reading) return;
    const blob = new Blob([readingText(reading)], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${projName || "athar"}-reading.txt`);
  };

  const doSave = async () => {
    setBusy("Saving on this device…");
    try {
      const { base, enhanced } = await renderEnhanced(MAX_EXPORT_PIXELS);
      await saveProject({
        id: crypto.randomUUID(),
        kind: "inscription",
        name: projName.trim() || "Untitled inscription",
        notes,
        createdAt: Date.now(),
        mode,
        params: { ...params },
        original: await canvasToBlob(base, 0.92),
        enhanced: await canvasToBlob(enhanced, 0.92),
        ...(exportInfo ? { exportInfo } : {}),
        machineReading: reading,
        ...(measurements && measurements.items.length > 0 ? { measurements } : {}),
        versions,
        annotations,
        serverSide: false,
        consentToShare: consent,
      });
      toast.success("Saved on this device.");
      logActivity({
        type: "project_saved",
        title: "Project saved",
        details: `${projName.trim() || "Untitled inscription"} (Local storage)`,
        status: "success",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const addAnnotation = () => {
    const rect = effectiveRect();
    if (!rect || !annotLabel.trim()) return;
    setAnnotations((a) => [...a, { ...rect, label: annotLabel.trim() }]);
    setAnnotLabel("");
  };

  const hasImage = !!rotated;

  return (
    <div className="space-y-4">
      {/* 1. capture */}
      <Section n={1} title="Capture or import">
        <div className="grid grid-cols-2 gap-3">
          <CameraButton
            mode={intent === "read" ? "inscription" : "rockart"}
            onPhotos={(photos) => void acceptPhotos(photos)}
          />
          <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()}>
            <ImageIcon /> Import image
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => void pickMain(e.target.files?.[0])}
        />
        <input
          ref={extraRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => void pickExtra(e.target.files)}
        />
        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
          <li>Hold the camera steady; brace against a rock if you can.</li>
          <li>Avoid direct glare and reflections on the surface.</li>
          <li>For carved inscriptions, try raking side lighting to reveal depth.</li>
          <li>Supported formats: JPEG and PNG. Your location is never requested.</li>
        </ul>
        {hasImage && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => extraRef.current?.click()}>
              <Plus /> Add photo under different lighting
            </Button>
            <span className="text-sm text-muted-foreground">{extra.length} extra photo(s)</span>
          </div>
        )}
      </Section>

      {/* 2. selection */}
      {hasImage && (
        <Section n={2} title="Select the inscription region">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant={tool === "select" ? "default" : "outline"}
              onClick={() => setTool("select")}
            >
              <Crop /> Select
            </Button>
            <Button variant={tool === "pan" ? "default" : "outline"} onClick={() => setTool("pan")}>
              <Hand /> Pan
            </Button>
            <Button variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw /> Rotate
            </Button>
            <Button variant="ghost" onClick={() => setSel(null)}>
              Clear selection
            </Button>
          </div>
          <Label className="text-sm">Zoom ×{zoom.toFixed(1)}</Label>
          <Slider
            value={[zoom]}
            min={1}
            max={4}
            step={0.1}
            onValueChange={(v) => setZoom(v[0] ?? 1)}
            className="my-2"
          />
          <div
            ref={viewRef}
            className="relative max-h-[60vh] overflow-auto rounded-xl border border-border"
          >
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="block touch-none"
              />
              {sel && (
                <div
                  className="pointer-events-none absolute border-2 border-accent bg-accent/20"
                  style={{
                    left: sel.x * displayScale,
                    top: sel.y * displayScale,
                    width: sel.w * displayScale,
                    height: sel.h * displayScale,
                  }}
                />
              )}
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Drag on the image to select the inscription. Without a selection the whole image is
            processed. The original photograph is never modified.
          </p>
        </Section>
      )}

      {/* 3. enhancement */}
      {hasImage && (
        <Section n={3} title="Enhance">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={mode === "carved" ? "default" : "secondary"}
              onClick={() => {
                setMode("carved");
                setParams(DEFAULTS.carved);
              }}
            >
              Carved inscription
            </Button>
            <Button
              variant={mode === "pigments" ? "default" : "secondary"}
              onClick={() => {
                setMode("pigments");
                setParams(DEFAULTS.pigments);
              }}
            >
              Pigment enhancement
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "carved"
              ? "CLAHE on luminance with mild sharpening and optional noise reduction — real pixel processing, not a CSS filter."
              : "RGB decorrelation stretch computed from the selected region's colour means, covariance and eigen decomposition, with regularisation against noise amplification."}
          </p>

          <div className="mt-3 space-y-4">
            <div>
              <Label className="text-sm">Intensity {Math.round(params.strength * 100)}%</Label>
              <Slider
                value={[params.strength]}
                min={0.1}
                max={1}
                step={0.05}
                onValueChange={(v) => setParams((p) => ({ ...p, strength: v[0] ?? p.strength }))}
                className="mt-2"
              />
            </div>
            {mode === "carved" && (
              <>
                <div>
                  <Label className="text-sm">CLAHE clip limit {params.clipLimit.toFixed(1)}</Label>
                  <Slider
                    value={[params.clipLimit]}
                    min={1}
                    max={6}
                    step={0.1}
                    onValueChange={(v) =>
                      setParams((p) => ({ ...p, clipLimit: v[0] ?? p.clipLimit }))
                    }
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-sm">Sharpening {Math.round(params.sharpen * 100)}%</Label>
                  <Slider
                    value={[params.sharpen]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => setParams((p) => ({ ...p, sharpen: v[0] ?? p.sharpen }))}
                    className="mt-2"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="denoise">Noise reduction</Label>
                  <Switch
                    id="denoise"
                    checked={params.denoise}
                    onCheckedChange={(c) => setParams((p) => ({ ...p, denoise: c }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="gray">Grayscale</Label>
                  <Switch
                    id="gray"
                    checked={params.grayscale}
                    onCheckedChange={(c) => setParams((p) => ({ ...p, grayscale: c }))}
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => void runPreview()} disabled={!!busy}>
              <Wand2 /> Enhance & preview
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                setParams(DEFAULTS[mode]);
                setBeforeUrl(null);
                setAfterUrl(null);
                setPreviewBlob(null);
                setMeasurements(null);
                setShowMeasure(false);
              }}
            >
              <RefreshCw /> Reset
            </Button>
          </div>

          {beforeUrl && afterUrl && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={viewMode === "2d" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("2d")}
                >
                  <ImageIcon /> 2D View
                </Button>
                <Button
                  variant={viewMode === "3d" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("3d")}
                >
                  <Boxes /> 3D Relief
                </Button>
              </div>

              {/* حاوية العرض المتطورة للقطعة الأثرية بتقنية الطبقات المتراكبة */}
              <div className="relative w-full min-h-[380px] sm:min-h-[440px] flex items-center justify-center bg-stone-900/10 rounded-2xl overflow-hidden border border-black/5 shadow-inner">
                {/* 1. كانفاس المعاينة والأصل (2D) - يبقى نشطاً دائماً */}
                <div
                  className={`w-full p-2 transition-opacity duration-300 ${
                    viewMode === "3d" ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                >
                  <BeforeAfter before={beforeUrl} after={afterUrl} />
                  <canvas ref={canvas2DRef} className="hidden" />
                </div>

                {/* 2. كانفاس التجسيم ثلاثي الأبعاد (3D) - يتراكب بدقة فوق الكانفاس الأول */}
                <canvas
                  ref={canvas3DRef}
                  className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
                    viewMode === "3d"
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0"
                  }`}
                />

                {/* دليل إرشادي للتفاعل مع المجسم في نمط 3D */}
                {viewMode === "3d" && !isProcessing3D && (
                  <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-background/80 px-2 py-1 text-center text-xs text-muted-foreground backdrop-blur z-20">
                    اسحب لتدوير الصخرة · إصبعين للتكبير · تجسيم فوري محلي 60fps
                  </div>
                )}

                {/* 3. مؤشر معالجة ذكي وهادئ (يظهر فقط أثناء بناء النموذج) */}
                {isProcessing3D && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-30 transition-all">
                    <div className="w-9 h-9 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-white text-xs font-medium tracking-wide">
                      جاري بناء المجسم الهندسي للقطعة...
                    </p>
                  </div>
                )}
              </div>
              {mode === "pigments" && (
                <Note>
                  Pigment mode output is enhanced / false colour. The colours are the result of a
                  statistical transform and are not the object's real colours.
                </Note>
              )}
              <Button variant="outline" className="w-full" onClick={() => void exportEnhanced()}>
                <Download /> Export enhanced image
              </Button>
              {exportInfo && <p className="text-sm text-muted-foreground">{exportInfo}</p>}

              {/* Measurement runs on the enhanced preview, since that is the
                  rendering whose pixel coordinates get stored. */}
              {previewBlob && !showMeasure && (
                <Button variant="outline" className="w-full" onClick={() => setShowMeasure(true)}>
                  <Ruler /> {t("ms.title")}
                </Button>
              )}
              {previewBlob && showMeasure && (
                <div className="rounded-xl border border-border p-3">
                  <MeasureCanvas
                    image={previewBlob}
                    {...(measurements ? { initial: measurements } : {})}
                    onChange={setMeasurements}
                  />
                </div>
              )}

              {!showRead && (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setShowRead(true);
                    requestAnimationFrame(() =>
                      document
                        .getElementById("athar-read-section")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                >
                  <ScrollText /> Read this inscription
                </Button>
              )}
            </div>
          )}
        </Section>
      )}

      {/* 4. reading */}
      {hasImage && showRead && (
        <div id="athar-read-section">
          <Section n={4} title="Read inscription">
            <div className="flex flex-wrap gap-2">
              {SCRIPTS.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={script === s.id ? "default" : "outline"}
                  onClick={() => setScript(s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("ask.answerLanguage")}:</span>
              {LANGS.map((l) => (
                <Button
                  key={l.id}
                  size="sm"
                  variant={lang === l.id ? "default" : "outline"}
                  onClick={() => setLang(l.id)}
                >
                  {l.native}
                </Button>
              ))}
            </div>

            <div className="mt-4">
              <LetterDetector
                getCanvas={async () => (await renderEnhanced(ANALYSIS_MAX_PIXELS)).enhanced}
                script={script}
                ready={!!beforeUrl}
                onHint={setDetectorHint}
              />
            </div>
            {detectorHint && (
              <Note>
                The trained model's sequence “{detectorHint.sequence || "—"}” (model v
                {detectorHint.modelVersion}) will be attached to the next reading as advisory input
                only. The reading step must still see each letter in the photograph itself.
              </Note>
            )}
            <Note>
              Selecting “Analyze inscription” sends the selected original, enhanced and any extra
              photographs to the analysis service. Readings are experimental and evidence-based; not
              every inscription can be read.
            </Note>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={() => void doAnalyze()}
              disabled={!!busy || !beforeUrl}
            >
              <ScrollText /> Analyze inscription
            </Button>
            {!beforeUrl && (
              <p className="mt-2 text-sm text-muted-foreground">
                Run an enhancement first so both the original and enhanced versions can be analysed.
              </p>
            )}

            {readError && (
              <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {readError}
              </p>
            )}

            {reading && (
              <div className="mt-4 space-y-3">
                <Field label="Suggested script" value={reading.script} />
                <Field label="Reading direction" value={reading.direction} />
                <Field
                  label="Visible characters (transliteration)"
                  value={reading.transliteration}
                />
                <Field label="Proposed reading" value={reading.proposedReading} />
                <Field label="Word segmentation" value={reading.wordSplit} />
                <Field
                  label={`Possible meaning (${reading.meaningLang === "ar" ? "Arabic" : "English"})`}
                  value={reading.meaning}
                  rtl={reading.meaningLang === "ar"}
                />
                <Field label="Uncertain characters" value={reading.uncertainties} />
                <Field label="Alternative readings" value={reading.alternatives} />
                {reading.note && <Field label="Note" value={reading.note} />}

                {(words.some((w) => w.examples.length > 0) || lexiconNote) && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Documented-corpus lexicon
                    </p>
                    {lexiconNote && (
                      <p
                        className="mt-1 text-sm"
                        dir={reading.meaningLang === "ar" ? "rtl" : "ltr"}
                      >
                        {lexiconNote}
                      </p>
                    )}
                    <ul className="mt-2 space-y-2 text-sm">
                      {words
                        .filter((w) => w.examples.length > 0)
                        .map((w) => (
                          <li key={w.token} className="rounded-lg bg-muted/50 p-3">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-mono font-semibold">{w.token}</span>
                              {w.arabic && (
                                <span dir="rtl" className="font-semibold">
                                  {w.arabic}
                                </span>
                              )}
                              {w.english && (
                                <span className="text-xs text-muted-foreground">{w.english}</span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {w.occurrences} published record(s) contain this word
                              </span>
                            </div>
                            {w.expertNotes?.length ? (
                              <ul className="mt-1 space-y-1">
                                {w.expertNotes.map((n, i) => (
                                  <li
                                    key={i}
                                    className="rounded border border-border/60 bg-background/60 p-2 text-xs"
                                  >
                                    <span className="font-medium">
                                      Expert-approved correction:{" "}
                                    </span>
                                    <span className="font-mono">{n.correctedReading}</span>
                                    {n.meaningAr && (
                                      <span dir="rtl" className="ml-1">
                                        {n.meaningAr}
                                      </span>
                                    )}
                                    <span className="block text-muted-foreground">
                                      Human-supplied evidence
                                      {n.siglum ? `, siglum ${n.siglum}` : ""}
                                      {n.sourceNote ? ` — ${n.sourceNote}` : ""}. Not a published
                                      translation.
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <ul className="mt-1 space-y-1">
                              {w.examples.map((e) => (
                                <li key={e.siglum} className="border-t border-border/60 pt-1">
                                  {e.url ? (
                                    <a
                                      className="text-xs underline"
                                      href={e.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {e.siglum}
                                    </a>
                                  ) : (
                                    <span className="text-xs">{e.siglum}</span>
                                  )}
                                  {e.transliteration && (
                                    <div className="font-mono text-xs">{e.transliteration}</div>
                                  )}
                                  <div className="text-xs">{e.translation}</div>
                                  {e.translationAr && (
                                    <div dir="rtl" className="text-xs">
                                      {e.translationAr}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Word meanings come from the editors' own published translations of records
                      that really contain the word; the Arabic is a machine rendering of those
                      translations. They ground the meaning above — they do not prove your
                      inscription says the same.
                    </p>
                  </div>
                )}
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    References
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {(reading.references.length ? reading.references : REFERENCE_SOURCES).map(
                      (r) => (
                        <li key={r.url}>
                          <a className="underline" href={r.url} target="_blank" rel="noreferrer">
                            {r.title}
                          </a>
                        </li>
                      ),
                    )}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    OCIANA and DASI publish no documented public API, so records are linked for
                    manual verification. A similar published inscription is not a verified match,
                    and dates or authorship cannot be established from a photograph alone.
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Similar published inscriptions
                  </p>
                  {parallels.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm">
                      {parallels.map((pl) => (
                        <li
                          key={`${pl.source}-${pl.siglum}`}
                          className="rounded-lg bg-muted/50 p-3"
                        >
                          <span className="font-semibold">{pl.siglum}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {pl.script ?? "script not stated"}
                            {pl.site ? ` · ${pl.site}` : ""} · {pl.source}
                          </span>
                          {pl.transliteration && (
                            <span className="mt-1 block font-mono text-xs">
                              {pl.transliteration}
                            </span>
                          )}
                          {pl.translation && (
                            <span className="mt-1 block text-muted-foreground">
                              {pl.translation}
                            </span>
                          )}
                          {pl.url && (
                            <a
                              className="mt-1 inline-block underline"
                              href={pl.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open the published record
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      No published inscription in the reference library resembles these letters
                      closely enough to be worth showing.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Retrieved by letter similarity from the imported reference library
                    {refCollection
                      ? ` (${refCollection.source} ${refCollection.version}, ${refCollection.records.toLocaleString()} records)`
                      : ""}
                    . These are comparanda for your own judgement, not verified matches for your
                    photograph, and they do not change the reading above.
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <Label htmlFor="correction">
                    Your correction (machine version kept separately)
                  </Label>
                  <Textarea
                    id="correction"
                    value={userReading}
                    onChange={(e) => setUserReading(e.target.value)}
                    className="mt-2"
                    rows={3}
                  />
                  <Input
                    placeholder="Reason for the correction (optional)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={saveCorrection}>
                      Report an issue / save correction
                    </Button>
                    <Button variant="outline" onClick={() => void shareForReview()}>
                      Share for expert review
                    </Button>
                    <Button variant="ghost" onClick={undoLastCorrection}>
                      <Undo2 /> Undo last correction
                    </Button>
                    <Button variant="outline" onClick={downloadReading}>
                      <Download /> Download reading (.txt)
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {versions.filter((v) => v.source === "user").length} correction version(s)
                    stored on this device. Corrections apply only to your project; they are never
                    treated as established facts or applied globally, and nothing is retrained
                    automatically.
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <Label htmlFor="annot">Manual annotation for the selected region</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="annot"
                      placeholder="e.g. third character, uncertain"
                      value={annotLabel}
                      onChange={(e) => setAnnotLabel(e.target.value)}
                    />
                    <Button variant="secondary" onClick={addAnnotation}>
                      Add
                    </Button>
                  </div>
                  {annotations.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {annotations.map((a, i) => (
                        <li key={i}>
                          {a.label} — {Math.round(a.w)}×{Math.round(a.h)} px at {Math.round(a.x)},
                          {Math.round(a.y)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Per-character localisation is not claimed automatically; annotate regions
                    manually instead.
                  </p>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* 5. save */}
      {hasImage && (
        <Section n={showRead ? 5 : 4} title="Save to this device">
          <Label htmlFor="pname">Project name (optional)</Label>
          <Input
            id="pname"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
            placeholder="e.g. Wadi inscription 3"
            className="mt-2"
          />
          <Label htmlFor="pnotes" className="mt-3 block">
            Notes
          </Label>
          <Textarea
            id="pnotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-2"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <Label htmlFor="consent" className="text-sm font-normal">
              I consent to my images and corrections being reused to improve the reference knowledge
              base.
            </Label>
            <Switch id="consent" checked={consent} onCheckedChange={setConsent} />
          </div>
          <Button size="lg" className="mt-3 w-full" onClick={() => void doSave()} disabled={!!busy}>
            <Save /> Save project
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Stored locally in this browser (IndexedDB). Nothing is uploaded except the images you
            explicitly send for analysis.
          </p>
        </Section>
      )}

      {busy && (
        <div className="panel p-3 text-center text-sm text-muted-foreground" role="status">
          {busy}
        </div>
      )}
    </div>
  );
}
