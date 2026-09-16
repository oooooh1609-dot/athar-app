/**
 * Compact language button for the top-right corner of every screen.
 * Shows the active language as a short mark (ع / EN / 中 / FR) and opens a
 * dropdown with all four languages in their native names. Switching is instant
 * and only rewrites interface text: the current screen, unsaved inscriptions
 * and any typed text stay exactly as they are.
 */

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { LANGS, useI18n, type UiLang } from "@/lib/i18n";

const SHORT: Record<string, string> = { ar: "ع", en: "EN", zh: "中", fr: "FR" };

export function LangButton({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("settings.language")}: ${active.native}`}
        className="grid size-11 place-items-center rounded-xl border border-border bg-card text-sm font-bold text-foreground transition hover:border-primary"
      >
        <span lang={active.locale} aria-hidden>
          {SHORT[active.id] ?? active.id.toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("settings.language")}
          className="absolute end-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="menuitemradio"
              aria-checked={lang === l.id}
              lang={l.locale}
              onClick={() => {
                setLang(l.id as UiLang);
                setOpen(false);
              }}
              className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start text-sm font-semibold transition ${
                lang === l.id
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs opacity-80" aria-hidden>
                  {SHORT[l.id] ?? l.id.toUpperCase()}
                </span>
                {l.native}
              </span>
              {lang === l.id && <Check className="size-4 shrink-0" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
