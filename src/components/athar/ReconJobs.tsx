import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { workerAdmin, type ReconJobSummary } from "@/lib/athar-api";

/**
 * Administrator monitor for 3D reconstruction jobs. Every state the backend
 * records is shown as-is — received (queued), processing, completed, failed,
 * canceled — together with the stage reported by the processing computer and
 * its progress percentage. Nothing here is estimated by the interface.
 */

const STATE_LABEL: Record<ReconJobSummary["status"], string> = {
  queued: "Received — waiting for the processing computer",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

const STATE_TONE: Record<ReconJobSummary["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  processing: "bg-primary/15 text-primary",
  completed: "bg-primary text-primary-foreground",
  failed: "bg-destructive/15 text-destructive",
  canceled: "bg-muted text-muted-foreground",
};

export function ReconJobs() {
  const [jobs, setJobs] = useState<ReconJobSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await workerAdmin({ action: "jobs" });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not read the reconstruction jobs.");
      return;
    }
    setJobs(res.jobs ?? []);
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, []);

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">3D reconstruction jobs</h2>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {(["queued", "processing", "completed", "failed", "canceled"] as const)
          .map((s) => `${STATE_LABEL[s].split(" —")[0]}: ${counts[s] ?? 0}`)
          .join(" · ")}
      </p>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reconstruction job has been submitted yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {j.project_name || "Untitled capture"}{" "}
                  <span className="text-muted-foreground">· {j.photo_count} photo(s)</span>
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_TONE[j.status]}`}>
                  {STATE_LABEL[j.status]}
                </span>
              </div>

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={j.status === "failed" ? "h-full bg-destructive" : "h-full bg-primary"}
                  style={{ width: `${Math.max(0, Math.min(100, j.progress))}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {j.progress}% {j.stage ? `· ${j.stage}` : ""}
                {j.owner_label ? ` · ${j.owner_label}` : ""} · submitted{" "}
                {new Date(j.created_at).toLocaleString()}
                {j.heartbeat_at
                  ? ` · last worker signal ${new Date(j.heartbeat_at).toLocaleTimeString()}`
                  : ""}
                {j.completed_at ? ` · finished ${new Date(j.completed_at).toLocaleString()}` : ""}
              </p>
              {j.error && <p className="mt-1 text-xs text-destructive">{j.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
