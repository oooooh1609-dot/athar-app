/**
 * Interface-language picker. Each language is offered by its own native name.
 * Switching is instant and only rewrites interface text: the current screen,
 * unsaved inscriptions and any typed text stay exactly as they are.
 */

import { Languages } from "lucide-react";

import { LANGS, useI18n, type UiLang } from "@/lib/i18n";

export function LanguageSelector({
  variant = "grid",
  showLabel = true,
}: {
  variant?: "grid" | "row";
  showLabel?: boolean;
}) {
  const { lang, setLang, t } = useI18n();

  return (
    <div>
      {showLabel && (
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Languages className="size-4" aria-hidden /> {t("settings.language")}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t("settings.language")}
        className={`mt-2 gap-2 ${variant === "grid" ? "grid grid-cols-2" : "flex flex-wrap"}`}
      >
        {LANGS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={lang === l.id}
            lang={l.locale}
            onClick={() => setLang(l.id as UiLang)}
            className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition ${
              lang === l.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary"
            }`}
          >
            {l.native}
          </button>
        ))}
      </div>
    </div>
  );
}
