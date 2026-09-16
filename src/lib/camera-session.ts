/**
 * One managed camera session for the whole app.
 *
 * Why a module-level singleton: iOS Safari gives a page a single usable capture
 * pipeline. Opening a second getUserMedia stream while an old one is still live
 * is what produces the frozen preview and the "camera will not reopen" state.
 * Every screen goes through this object, so an old stream is always stopped
 * before a new one starts, and an interrupted start is discarded instead of
 * leaving a half-open track behind.
 *
 * Capability probing is honest: we only report zoom / torch / focus / exposure
 * when the live track actually advertises them, so the interface can hide
 * controls that would silently do nothing.
 */

export type ZoomRange = { min: number; max: number; step: number };

export type CameraCapabilities = {
  /** Hardware (optical or sensor) zoom range, or null when unsupported. */
  zoom: ZoomRange | null;
  torch: boolean;
  focusModes: string[];
  exposureModes: string[];
  /** Actual negotiated frame size. */
  width: number;
  height: number;
  label: string;
  facing: string | null;
};

export type SessionState = "idle" | "starting" | "live" | "interrupted" | "error";

type Listener = () => void;

type ExtendedCaps = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
  focusMode?: string[];
  exposureMode?: string[];
};

type ExtendedConstraint = MediaTrackConstraintSet & {
  zoom?: number;
  torch?: boolean;
  focusMode?: string;
};

class Session {
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private generation = 0;
  private listeners = new Set<Listener>();

  state: SessionState = "idle";
  error: string | null = null;
  capabilities: CameraCapabilities | null = null;
  /** Hardware zoom currently applied to the track, when supported. */
  hardwareZoom = 1;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  get liveStream() {
    return this.state === "live" ? this.stream : null;
  }

  supported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Stops every track and clears all derived state. Safe to call repeatedly. */
  stop() {
    this.generation++;
    for (const t of this.stream?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {
        /* already ended */
      }
    }
    this.stream = null;
    this.track = null;
    this.capabilities = null;
    this.hardwareZoom = 1;
    this.state = "idle";
    this.error = null;
    this.emit();
  }

  /**
   * Starts a fresh session. Any previous stream is stopped first, and a start
   * that gets superseded (user navigated away, pressed retry) is thrown away.
   */
  async start(opts: { facingMode?: "environment" | "user" } = {}) {
    if (!this.supported()) {
      this.state = "error";
      this.error = "unsupported";
      this.emit();
      return null;
    }

    this.stop();
    const gen = this.generation;
    this.state = "starting";
    this.error = null;
    this.emit();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: opts.facingMode ?? "environment" },
          width: { ideal: 3000 },
          height: { ideal: 3000 },
        },
      });
    } catch (e) {
      if (gen !== this.generation) return null;
      this.state = "error";
      this.error = e instanceof Error ? e.name : "unknown";
      this.emit();
      return null;
    }

    // A newer start (or a stop) happened while permission was pending.
    if (gen !== this.generation) {
      for (const t of stream.getTracks()) t.stop();
      return null;
    }

    this.stream = stream;
    const track = stream.getVideoTracks()[0] as MediaStreamTrack | undefined;
    this.track = track ?? null;
    this.capabilities = track ? probe(track) : null;

    if (track) {
      const onLost = () => {
        if (gen !== this.generation) return;
        this.state = "interrupted";
        this.emit();
      };
      track.addEventListener("ended", onLost);
      track.addEventListener("mute", onLost);
      track.addEventListener("unmute", () => {
        if (gen !== this.generation) return;
        if (this.state === "interrupted") {
          this.state = "live";
          this.emit();
        }
      });
    }

    this.state = "live";
    this.emit();
    return stream;
  }

  /** True when the hardware accepted the zoom factor. */
  async applyHardwareZoom(value: number) {
    const range = this.capabilities?.zoom;
    if (!this.track || !range) return false;
    const clamped = Math.min(range.max, Math.max(range.min, value));
    try {
      await this.track.applyConstraints({ advanced: [{ zoom: clamped } as ExtendedConstraint] });
      this.hardwareZoom = clamped;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  async setTorch(on: boolean) {
    if (!this.track || !this.capabilities?.torch) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on } as ExtendedConstraint] });
      return true;
    } catch {
      return false;
    }
  }

  async setFocusMode(mode: string) {
    if (!this.track || !this.capabilities?.focusModes.includes(mode)) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ focusMode: mode } as ExtendedConstraint] });
      return true;
    } catch {
      return false;
    }
  }
}

function probe(track: MediaStreamTrack): CameraCapabilities {
  let caps: ExtendedCaps = {};
  try {
    caps = (track.getCapabilities?.() ?? {}) as ExtendedCaps;
  } catch {
    caps = {};
  }
  const settings = track.getSettings();
  const zoom =
    caps.zoom && typeof caps.zoom.min === "number" && caps.zoom.max > caps.zoom.min
      ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 }
      : null;
  return {
    zoom,
    torch: caps.torch === true,
    focusModes: Array.isArray(caps.focusMode) ? caps.focusMode : [],
    exposureModes: Array.isArray(caps.exposureMode) ? caps.exposureMode : [],
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    label: track.label || "",
    facing: (settings.facingMode as string | undefined) ?? null,
  };
}

export const cameraSession = new Session();
