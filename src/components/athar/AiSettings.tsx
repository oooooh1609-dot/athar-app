/** Administrator view of the AI provider, models, spending controls and usage. */

import { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aiStatus, aiUpdate, type AiStatus } from "@/lib/ask-client";

export function AiSettings() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [quick, setQuick] = useState("");
  const [detailed, setDetailed] = useState("");
  const [limit, setLimit] = useState(500);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async (res: AiStatus) => {
    setStatus(res);
    if (res.settings) {
      setQuick(res.settings.quickModel);
      setDetailed(res.settings.detailedModel);
      setLimit(res.settings.monthlyCallLimit);
      setEnabled(res.settings.enabled);
    }
  };

  useEffect(() => {
    void aiStatus().then(load);
  }, []);

  const save = async () => {
    setBusy(true);
    const res = await aiUpdate({
      quickModel: quick.trim(),
      detailedModel: detailed.trim(),
      monthlyCallLimit: limit,
      enabled,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save.");
      return;
    }
    await load(res);
    toast.success("AI settings saved.");
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Cpu className="size-5" /> Assistant provider & usage
      </h2>

      {!status && <p className="text-sm text-muted-foreground">Loading…</p>}

      {status?.ok && (
        <>
          <p className="text-sm">
            Provider: <strong>{status.provider}</strong> —{" "}
            {status.credentialPresent ? (
              "server credential present"
            ) : (
              <span className="text-destructive">
                server credential missing; the assistant cannot run until it is configured
              </span>
            )}
            .
          </p>
          <p className="text-sm text-muted-foreground">
            External scholarly search:{" "}
            {(status.externalSearch ?? [])
              .map((s) => `${s.name} (${s.keyRequired ? "key required" : "no key required"})`)
              .join(", ")}
            . No paid search subscription is used, so results are limited to what these open
            publication databases return.
          </p>
          <p className="text-sm">
            Calls this month: <strong>{status.usage?.callsThisMonth ?? 0}</strong> of{" "}
            <strong>{status.usage?.limit ?? 0}</strong>. Reaching the limit stops assistant calls
            until it is raised.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="quick-model" className="text-xs">
                Quick Answer model
              </Label>
              <Input id="quick-model" value={quick} onChange={(e) => setQuick(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="detailed-model" className="text-xs">
                Detailed Research model
              </Label>
              <Input
                id="detailed-model"
                value={detailed}
                onChange={(e) => setDetailed(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="call-limit" className="text-xs">
                Monthly call limit (0 = unlimited)
              </Label>
              <Input
                id="call-limit"
                type="number"
                min={0}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4"
              />
              Assistant enabled
            </label>
          </div>

          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Save settings
          </Button>
          <p className="text-xs text-muted-foreground">
            A model id must exist on the configured gateway; an unknown id makes every call fail
            with a rejection from the provider.
          </p>
        </>
      )}

      {status && !status.ok && (
        <p className="text-sm text-destructive">{status.error ?? "Not available."}</p>
      )}
    </section>
  );
}
