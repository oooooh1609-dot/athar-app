import { useEffect, useRef, useState } from "react";

/**
 * Interactive GLB viewer (rotate / zoom / pan) using Google's model-viewer
 * web component, loaded lazily in the browser only.
 * Supports DStretch enhanced texture projection onto the 3D model materials.
 */
type ModelViewerElement = HTMLElement & {
  model?: {
    materials?: Array<{
      pbrMetallicRoughness?: {
        baseColorTexture?: {
          setTexture: (t: unknown) => void;
        };
      };
    }>;
  };
  createTexture: (src: string) => Promise<unknown>;
};

export function ModelViewer({ src, textureUrl }: { src: string; textureUrl?: string | null }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const viewerRef = useRef<ModelViewerElement | null>(null);

  useEffect(() => {
    if (customElements.get("model-viewer")) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    s.onload = () => setReady(true);
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);
  }, []);

  // ربط الصورة المعززة بالتجسيم ثلاثي الأبعاد (Texture Projection)
  useEffect(() => {
    if (!ready) return;
    const el = viewerRef.current;
    if (!el) return;

    const effectiveTexture =
      textureUrl ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("athar_enhanced_texture_data")
        : null);

    if (!effectiveTexture) return;

    const applyTexture = async () => {
      try {
        if (!el.model || !el.model.materials) {
          el.addEventListener("load", applyTexture, { once: true });
          return;
        }
        const texture = await el.createTexture(effectiveTexture);
        if (el.model.materials && el.model.materials.length > 0) {
          for (const mat of el.model.materials) {
            if (mat.pbrMetallicRoughness?.baseColorTexture) {
              mat.pbrMetallicRoughness.baseColorTexture.setTexture(texture);
            }
          }
        }
      } catch (err) {
        console.warn("Could not apply DStretch texture to 3D model:", err);
      }
    };

    void applyTexture();
  }, [ready, src, textureUrl]);

  if (failed)
    return (
      <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        The 3D viewer could not be loaded. You can still download the model file below.
      </p>
    );
  if (!ready) return <p className="text-sm text-muted-foreground">Loading the 3D viewer…</p>;

  const Tag = "model-viewer" as unknown as React.ElementType;
  return (
    <Tag
      ref={viewerRef}
      dir="ltr"
      src={src}
      camera-controls
      touch-action="pan-y"
      style={{ width: "100%", height: "60vh", background: "var(--muted)" }}
      ar-status="not-presenting"
    />
  );
}
