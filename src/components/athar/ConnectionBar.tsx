/**
 * Connection and update banner.
 *
 * Sits under the header rather than floating, so it never covers a control.
 * It says what still works offline instead of only announcing the failure —
 * on a site with no signal, "you are offline" alone is not useful.
 */

import { CloudOff, RefreshCw } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useServiceWorker } from "@/lib/pwa";

export function ConnectionBar() {
  const { t } = useI18n();
  const { online, updateReady, applyUpdate } = useServiceWorker();

  if (online && !updateReady) return null;

  if (!online)
    return (
      <div
        role="status"
        className="flex items-start gap-2 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground"
      >
        <CloudOff className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold text-foreground">{t("pwa.offline")}</strong>{" "}
          {t("pwa.offlineWhatWorks")}
        </span>
      </div>
    );

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-2 text-xs">
      <span className="text-foreground">{t("pwa.updateReady")}</span>
      <button
        onClick={applyUpdate}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
      >
        <RefreshCw className="size-3.5" />
        {t("pwa.updateNow")}
      </button>
    </div>
  );
}
