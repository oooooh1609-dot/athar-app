export interface InscriptionOrientation {
  pitchDeg: number; // زاوية ميلان واجهة الصخرة عمودياً
  rollDeg: number; // اتجاه استواء الأفق (الميزان المائي)
  compassHeadingDeg: number; // اتجاه وجه الصخرة بالنسبة للشمال المغناطيسي
  isLevel: boolean; // تحقق تعامد التصوير على النقش (Perpendicularity)
}

export interface ArchaeologicalCaptureMetadata {
  timestamp: string;
  orientation: InscriptionOrientation;
  geo?: { lat: number; lon: number; altitudeM: number };
  exposureTimeMs?: number;
}

interface WebKitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export class ArchaeologicalCameraSession {
  private orientation: InscriptionOrientation = {
    pitchDeg: 0,
    rollDeg: 0,
    compassHeadingDeg: 0,
    isLevel: false,
  };

  private boundDeviceMotion = this.handleDeviceOrientation.bind(this);

  public startTelemetry(): void {
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", this.boundDeviceMotion, true);
    }
  }

  public stopTelemetry(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("deviceorientation", this.boundDeviceMotion, true);
    }
  }

  private handleDeviceOrientation(e: DeviceOrientationEvent): void {
    const pitch = e.beta ?? 0;
    const roll = e.gamma ?? 0;
    let heading = e.alpha ?? 0;

    // معالجة الشمال على أجهزة iOS
    const webkitEvent = e as WebKitDeviceOrientationEvent;
    if (typeof webkitEvent.webkitCompassHeading === "number") {
      heading = webkitEvent.webkitCompassHeading;
    }

    // فحص استواء الكاميرا الميداني (هامش خطأ أقل من ±2.5 درجة للتوثيق المتري)
    const isLevel = Math.abs(roll) < 2.5 && Math.abs(pitch - 90) < 5.0;

    this.orientation = {
      pitchDeg: Number(pitch.toFixed(1)),
      rollDeg: Number(roll.toFixed(1)),
      compassHeadingDeg: Number(heading.toFixed(1)),
      isLevel,
    };
  }

  public getTelemetry(): InscriptionOrientation {
    return { ...this.orientation };
  }

  /**
   * تغليف بيانات اللقطة الأثرية بصيغة الميتاداتا الدولية EXIF / CIDOC
   */
  public buildMetadata(geoCoords?: {
    lat: number;
    lon: number;
    altitudeM: number;
  }): ArchaeologicalCaptureMetadata {
    return {
      timestamp: new Date().toISOString(),
      orientation: this.getTelemetry(),
      geo: geoCoords,
    };
  }
}

export type CameraState = "idle" | "starting" | "live" | "interrupted" | "error";

export interface CameraCapabilities {
  torch: boolean;
  zoom?: { min: number; max: number; step: number };
  focusModes: string[];
}

export class CameraSessionManager {
  public state: CameraState = "idle";
  public capabilities: CameraCapabilities | null = null;
  public error: string | null = null;
  public liveStream: MediaStream | null = null;

  private listeners = new Set<() => void>();
  private telemetrySession = new ArchaeologicalCameraSession();

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  public async start(): Promise<void> {
    if (this.state === "starting" || (this.state === "live" && this.liveStream?.active)) {
      return;
    }

    this.state = "starting";
    this.error = null;
    this.notify();
    this.telemetrySession.startTelemetry();

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("unsupported");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      this.liveStream = stream;
      this.state = "live";

      // Detect hardware capabilities
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = (
          typeof track.getCapabilities === "function" ? track.getCapabilities() : {}
        ) as {
          torch?: boolean;
          zoom?: { min?: number; max?: number; step?: number };
          focusMode?: string[];
        };

        this.capabilities = {
          torch: Boolean(caps.torch),
          zoom: caps.zoom?.max
            ? {
                min: caps.zoom.min ?? 1,
                max: caps.zoom.max,
                step: caps.zoom.step ?? 0.1,
              }
            : undefined,
          focusModes: Array.isArray(caps.focusMode) ? caps.focusMode : [],
        };
      } else {
        this.capabilities = { torch: false, focusModes: [] };
      }

      this.notify();
    } catch (err: unknown) {
      this.state = "error";
      const e = err as { name?: string; message?: string };
      this.error = e.name ?? e.message ?? "error";
      this.notify();
    }
  }

  public stop(): void {
    if (this.liveStream) {
      for (const track of this.liveStream.getTracks()) {
        track.stop();
      }
      this.liveStream = null;
    }
    this.telemetrySession.stopTelemetry();
    this.state = "idle";
    this.capabilities = null;
    this.notify();
  }

  public async applyHardwareZoom(zoom: number): Promise<void> {
    const track = this.liveStream?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== "function") return;
    try {
      const advanced = [{ zoom }] as unknown as MediaTrackConstraintSet[];
      await track.applyConstraints({ advanced });
    } catch {
      // Hardware zoom not supported
    }
  }

  public async setTorch(on: boolean): Promise<void> {
    const track = this.liveStream?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== "function") return;
    try {
      const advanced = [{ torch: on }] as unknown as MediaTrackConstraintSet[];
      await track.applyConstraints({ advanced });
    } catch {
      // Torch not supported
    }
  }

  public async setFocusMode(mode: string): Promise<void> {
    const track = this.liveStream?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== "function") return;
    try {
      const advanced = [{ focusMode: mode }] as unknown as MediaTrackConstraintSet[];
      await track.applyConstraints({ advanced });
    } catch {
      // Focus mode not supported
    }
  }

  public getTelemetry(): InscriptionOrientation {
    return this.telemetrySession.getTelemetry();
  }

  public buildMetadata(geoCoords?: {
    lat: number;
    lon: number;
    altitudeM: number;
  }): ArchaeologicalCaptureMetadata {
    return this.telemetrySession.buildMetadata(geoCoords);
  }
}

export const cameraSession = new CameraSessionManager();
