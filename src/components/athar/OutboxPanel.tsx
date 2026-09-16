/**
 * The queue of submissions waiting for a connection.
 *
 * Flushes on three triggers: the browser reporting it is back online, the
 * tab becoming visible again, and a slow interval. The interval matters
 * because `navigator.onLine` reports the network interface, not reachability
 * — a phone attached to a captive portal or a dead cell reports itself
 * online, and the `online` event never fires when the signal genuinely
 * returns.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Upload } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import {
  flushOutbox,
  listOutbox,
  removeFromOutbox,
  retryNow,
  type OutboxEntry,
} from "@/lib/outbox";

const POLL_MS = 60_000;

export function OutboxPanel() {
  const { t } = useI18n();
  const [items, setItems] = useState<OutboxEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      setItems(await listOutbox());
    } catch {
      /* Storage unavailable; the panel simply stays empty. */
    }
  }, []);

  const flush = useCallback(async () => {
    const report = await flushOutbox().catch(() => null);
    if (!report) return;
    if (report.sent > 0) toast.success(t("ob.sent", { count: report.sent }));
    for (const d of report.discarded)
      toast.error(t("ob.rejected", { label: d.label, error: d.error }));
    await refresh();
  }, [refresh, t]);

  useEffect(() => {
    void refresh();
    void flush();

    const onOnline = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void flush(), POLL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [flush, refresh]);

  if (items.length === 0) return null;

  return (
    <section className="panel space-y-3 p-3">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Upload className="size-4 text-muted-foreground" />
          {t("ob.title")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("ob.pending", { count: items.length })}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm">{item.label}</span>
              {item.stalled && <span className="block text-xs text-accent">{t("ob.stalled")}</span>}
              {!item.stalled && item.lastError && (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.lastError}
                </span>
              )}
            </span>
            <span className="flex shrink-0 gap-1">
              {item.stalled && (
                <button
                  onClick={async () => {
                    await retryNow(item.id);
                    await flush();
                  }}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                  aria-label={t("ob.retry")}
                >
                  <RefreshCw className="size-4" />
                </button>
              )}
              <button
                onClick={async () => {
                  await removeFromOutbox(item.id);
                  await refresh();
                }}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                aria-label={t("ob.discard")}
              >
                <Trash2 className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <button onClick={() => void flush()} className="text-sm font-semibold text-primary">
        {t("ob.retryAll")}
      </button>
    </section>
  );
}
