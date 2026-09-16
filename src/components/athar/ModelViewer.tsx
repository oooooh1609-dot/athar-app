import { useEffect, useState } from "react";

/**
 * Interactive GLB viewer (rotate / zoom / pan) using Google's model-viewer
 * web component, loaded lazily in the browser only.
 */
export function ModelViewer({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (customElements.get("model-viewer")) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js";
    s.onload = () => setReady(true);
    s.onerror = () => setFailed(true);
    document.head.appendChild(s);
  }, []);

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
      dir="ltr"
      src={src}
      camera-controls
      touch-action="pan-y"
      style={{ width: "100%", height: "60vh", background: "var(--muted)" }}
      ar-status="not-presenting"
    />
  );
}
