import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Plus, RefreshCw, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workerAdmin, type WorkerCredential } from "@/lib/athar-api";

/**
 * Administrator page for connecting the self-hosted Meshroom processing
 * computer. Credentials are scoped to the worker endpoints, revocable, and
 * shown in full exactly once.
 */
export function WorkerSetup() {
  const [workers, setWorkers] = useState<WorkerCredential[]>([]);
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const baseUrl = typeof window === "undefined" ? "" : window.location.origin;

  const load = async () => {
    const res = await workerAdmin({ action: "list" });
    if (!res.ok) {
      toast.error(res.error ?? "Could not read the processing computers.");
      return;
    }
    setWorkers(res.workers ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const issue = async () => {
    if (label.trim().length < 2) {
      toast.error("Give the computer a short name first.");
      return;
    }
    setBusy(true);
    const res = await workerAdmin({ action: "issue", label: label.trim() });
    setBusy(false);
    if (!res.ok || !res.token) {
      toast.error(res.error ?? "Could not issue a credential.");
      return;
    }
    setIssued(res.token);
    setLabel("");
    await load();
  };

  const revoke = async (id: string) => {
    const res = await workerAdmin({ action: "revoke", id });
    if (!res.ok) {
      toast.error(res.error ?? "Could not revoke the credential.");
      return;
    }
    toast.success("Credential revoked. That computer can no longer claim jobs.");
    setWorkers(res.workers ?? workers);
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="font-bold">3D processing computer (self-hosted Meshroom)</h2>
      <p className="text-sm text-muted-foreground">
        Reconstruction runs on your own computer with Meshroom / AliceVision — free, open-source
        software with no licence fee and no paid reconstruction API. You still pay for your own
        electricity, internet and any storage or hosting you use. The companion worker only makes
        outbound HTTPS calls to this app, so no inbound port has to be opened.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 grow">
          <Label htmlFor="worker-label">Computer name</Label>
          <Input
            id="worker-label"
            value={label}
            placeholder="e.g. Studio desktop (RTX 3060)"
            onChange={(e) => setLabel(e.target.value)}
            className="mt-2"
          />
        </div>
        <Button onClick={() => void issue()} disabled={busy}>
          <Plus /> Issue worker key
        </Button>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw /> Refresh
        </Button>
        <Button asChild variant="secondary">
          <a href="/athar-worker.zip" download>
            <Download /> Download worker
          </a>
        </Button>
      </div>

      {issued && (
        <div className="space-y-2 rounded-lg bg-warn p-3 text-sm text-warn-foreground">
          <p>
            Copy this key into the worker's <code>.env</code> file now. It is shown once and is not
            stored in readable form.
          </p>
          <div className="flex items-center gap-2">
            <code className="grow break-all rounded bg-card/70 p-2">{issued}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(issued);
                toast.success("Key copied.");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
            I saved it
          </Button>
        </div>
      )}

      {workers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No processing computer is connected yet, so reconstruction jobs stay queued.
        </p>
      ) : (
        <ul className="space-y-2">
          {workers.map((w) => (
            <li key={w.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {w.label}{" "}
                <span className={w.online ? "text-primary" : "text-muted-foreground"}>
                  · {w.revoked_at ? "revoked" : w.online ? "online" : "offline"}
                </span>
              </p>
              <p className="text-muted-foreground">
                key {w.token_prefix}… · {w.host ?? "host unknown"} ·{" "}
                {w.meshroom_version
                  ? `Meshroom ${w.meshroom_version}`
                  : "Meshroom version not reported"}
                {w.last_seen_at ? ` · last seen ${new Date(w.last_seen_at).toLocaleString()}` : ""}
              </p>
              {!w.revoked_at && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void revoke(w.id)}
                >
                  <ShieldOff /> Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <p className="text-sm font-semibold">Connection details for the worker</p>
        <div className="flex items-center gap-2">
          <code className="grow break-all rounded bg-muted p-2">ATHAR_BASE_URL={baseUrl}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(baseUrl);
              toast.success("Address copied.");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        <p className="text-muted-foreground">
          Paste this address and the worker key into the worker's <code>.env</code> file.
        </p>
        <p className="text-muted-foreground">
          Setup on your computer: download the ZIP above, unzip it, then run{" "}
          <code>install.ps1</code> on Windows or <code>./install.sh</code> on Linux / macOS. The
          installer checks for Python 3.10+, installs the worker's dependencies, looks for Meshroom
          and Blender and links their free download pages if missing, prints the recommended
          hardware, and creates the <code>.env</code> file. Then run{" "}
          <code>python athar_worker.py</code>. Meshroom, Blender and this worker have no licence
          fee; electricity, internet, storage and hosting remain your own costs.
        </p>
      </div>
    </section>
  );
}
