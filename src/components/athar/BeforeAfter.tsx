import { useRef, useState } from "react";

/** Synchronized before/after slider comparing the original with the enhanced frame. */
export function BeforeAfter({
  before,
  after,
  alt = "Inscription",
}: {
  before: string;
  after: string;
  alt?: string;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = ((clientX - r.left) / r.width) * 100;
    setPos(Math.min(100, Math.max(0, p)));
  };

  return (
    <div className="space-y-2">
      <div
        ref={ref}
        className="relative select-none overflow-hidden rounded-xl border border-border bg-muted"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX);
        }}
      >
        <img src={before} alt={`${alt} — original`} className="block w-full" />
        <img
          src={after}
          alt={`${alt} — enhanced`}
          className="absolute inset-0 block w-full"
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-primary" style={{ left: `${pos}%` }} />
        <div
          className="absolute top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Left of slider: original</span>
        <span>Right of slider: enhanced</span>
      </div>
    </div>
  );
}
