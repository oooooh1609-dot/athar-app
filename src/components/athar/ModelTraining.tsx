/**
 * Administrator panel for training and activating the letter-shape model.
 *
 * Training uses only expert-approved examples. Every version is measured by
 * cross-validation before it may be activated, and a version that does not clear
 * the published thresholds is refused rather than shipped.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Play, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { glyphTrain } from "@/lib/athar-api";

type Version = {
  id: string;
  version: number;
  accuracy: number | null;
  macro_f1: number | null;
  letters: number;
  trained_on: number;
  status: string;
  created_at: string;
  activated_at: string | null;
};

const SCRIPTS = ["thamudic", "dadanitic", "nabataean", "other"] as const;

export function ModelTraining() {
  const [script, setScript] = useState<string>("thamudic");
  const [versions, setVersions] = useState<Version[]>([]);
  const [provenance, setProvenance] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (s = script) => {
    setBusy(true);
    const res = await glyphTrain({ action: "list", script: s });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load the model versions.");
      return;
    }
    setVersions((res.versions ?? []) as Version[]);
  };

  useEffect(() => {
    void load(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const train = async () => {
    setBusy(true);
    const res = await glyphTrain({
      action: "train",
      script,
      ...(provenance.trim() ? { provenance: provenance.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setNote(res.message ?? res.error ?? "Training produced no model.");
      return;
    }
    setNote(
      `Version ${res.version} trained on ${res.trainedOn} approved example(s) covering ${res.letters} letter(s). ` +
        `Cross-validated accuracy ${
          typeof res.accuracy === "number" ? `${(res.accuracy * 100).toFixed(1)}%` : "unmeasured"
        }, macro F1 ${typeof res.macroF1 === "number" ? res.macroF1.toFixed(2) : "unmeasured"}, ` +
        `${res.metrics?.abstained ?? 0} held-out sign(s) abstained. ` +
        (res.eligible
          ? "It may be activated."
          : `It may not be activated yet: it ${(res.reasons ?? []).join("; and it ")}.`),
    );
    void load();
  };

  const activate = async (version: number) => {
    const res = await glyphTrain({ action: "activate", script, version });
    if (!res.ok) {
      toast.error(res.error ?? "Activation refused.");
      return;
    }
    toast.success(`Version ${version} is now active for ${script}.`);
    void load();
  };

  const retire = async () => {
    const res = await glyphTrain({ action: "retire", script });
    if (!res.ok) {
      toast.error(res.error ?? "Could not retire the active model.");
      return;
    }
    toast.success("No model is active for this script now.");
    void load();
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Brain className="size-4" /> Letter model training
      </h2>
      <p className="text-sm text-muted-foreground">
        A per-letter shape prototype with a learned acceptance threshold, trained on approved
        examples only and measured by stratified cross-validation. It is not a neural network, and
        the app names a letter only while a measured version is active.
      </p>

      <div className="flex flex-wrap gap-2">
        {SCRIPTS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={script === s ? "default" : "outline"}
            onClick={() => setScript(s)}
          >
            {s}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
        <Button size="sm" onClick={() => void train()} disabled={busy}>
          <Play /> Train a new version
        </Button>
        <Button size="sm" variant="outline" onClick={() => void retire()} disabled={busy}>
          <PowerOff /> Retire active
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="model-prov" className="text-sm">
          Provenance note for this training run
        </Label>
        <Input
          id="model-prov"
          value={provenance}
          onChange={(e) => setProvenance(e.target.value)}
          placeholder="e.g. approved labels from published Jubbah and Rum photographs"
        />
      </div>

      {note && <p className="rounded-lg bg-muted p-3 text-sm">{note}</p>}

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No model version exists for this script yet.
        </p>
      ) : (
        versions.map((v) => (
          <article key={v.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold">
              Version {v.version} · {v.status}
            </p>
            <p className="text-muted-foreground">
              {v.letters} letter(s), {v.trained_on} example(s) ·{" "}
              {v.accuracy === null
                ? "accuracy unmeasured"
                : `${(v.accuracy * 100).toFixed(1)}% cross-validated`}
              {v.macro_f1 === null ? "" : ` · macro F1 ${v.macro_f1.toFixed(2)}`} ·{" "}
              {new Date(v.created_at).toLocaleString()}
            </p>
            {v.status !== "active" && (
              <Button size="sm" className="mt-2" onClick={() => void activate(v.version)}>
                Activate this version
              </Button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
