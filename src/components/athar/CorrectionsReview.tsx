/**
 * Expert review of shared reading corrections.
 *
 * Nothing a user submits is visible to other people until it is approved here.
 * Approving a correction publishes it as human-supplied evidence next to the
 * machine reading — it does not retrain anything on its own.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminCorrections,
  reviewCorrection,
  type SharedCorrectionView,
} from "@/lib/corrections-client";

const TABS = ["pending", "approved", "rejected"] as const;

export function CorrectionsReview() {
  const [status, setStatus] = useState<(typeof TABS)[number]>("pending");
  const [items, setItems] = useState<SharedCorrectionView[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async (s = status) => {
    setBusy(true);
    const res = await adminCorrections(s);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load corrections.");
      return;
    }
    setItems(res.items ?? []);
    setCounts(res.counts ?? {});
  };

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(true);
    const res = await reviewCorrection(id, decision, notes[id]);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Review failed.");
      return;
    }
    toast.success(decision === "approved" ? "Approved and now shared." : "Rejected.");
    void load(status);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Shared reading corrections</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Submissions stay private until approved. Approved corrections are shown to everyone as
        human-supplied evidence with their source note; they never overwrite a machine reading and
        do not retrain the letter model.
      </p>

      <div className="mt-3 flex gap-2">
        {TABS.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={status === t ? "default" : "outline"}
            onClick={() => setStatus(t)}
          >
            {t} {counts[t] ? `(${counts[t]})` : ""}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">No {status} corrections.</p>
        )}
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">{c.script}</span>
              {c.siglum && <span>siglum {c.siglum}</span>}
              <span>{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            {c.machineReading && (
              <p className="mt-2 break-words">
                <span className="text-muted-foreground">Machine: </span>
                {c.machineReading}
              </p>
            )}
            <p className="mt-1 break-words font-medium">
              <span className="text-muted-foreground font-normal">Corrected: </span>
              {c.correctedReading}
            </p>
            {c.word && (
              <p className="mt-1 break-words">
                <span className="text-muted-foreground">Word: </span>
                {c.word}
                {c.meaningAr ? ` — ${c.meaningAr}` : ""}
              </p>
            )}
            {c.reason && <p className="mt-1 break-words text-muted-foreground">{c.reason}</p>}
            {c.sourceNote && (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                Source: {c.sourceNote}
              </p>
            )}
            {c.permissionNote && (
              <p className="break-words text-xs text-muted-foreground">
                Permission: {c.permissionNote}
              </p>
            )}
            {status === "pending" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Reviewer note (optional)"
                  value={notes[c.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                  className="max-w-xs"
                />
                <Button size="sm" onClick={() => void decide(c.id, "approved")} disabled={busy}>
                  <Check /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decide(c.id, "rejected")}
                  disabled={busy}
                >
                  <X /> Reject
                </Button>
              </div>
            )}
            {c.reviewerNote && (
              <p className="mt-1 text-xs text-muted-foreground">Reviewer: {c.reviewerNote}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
