import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Download, LogOut, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccessManagement } from "@/components/athar/AccessManagement";
import { AdminPassword } from "@/components/athar/AdminPassword";
import { AiSettings } from "@/components/athar/AiSettings";
import { FeedbackInbox } from "@/components/athar/FeedbackInbox";
import { CorpusLabeller } from "@/components/athar/CorpusLabeller";
import { CorrectionsReview } from "@/components/athar/CorrectionsReview";
import { ModelTraining } from "@/components/athar/ModelTraining";
import { ResearchLibrary } from "@/components/athar/ResearchLibrary";
import { WorkerSetup } from "@/components/athar/WorkerSetup";
import { ReconJobs } from "@/components/athar/ReconJobs";
import { ExtensionsScripts } from "@/components/athar/ExtensionsScripts";
import { adminLogin, glyphReview, importReferences, referenceStatus } from "@/lib/athar-api";
import { listProjects, type AtharProject, type ReadingVersion } from "@/lib/athar-db";
import { LangButton } from "@/components/athar/LangButton";
import { LanguageSelector } from "@/components/athar/LanguageSelector";
import { adminLogout, isAdminLoggedIn, verifyAdminPin } from "@/lib/admin-auth";

type PendingLabel = {
  id: string;
  script: string;
  letter: string;
  transliteration: string | null;
  provenance: string | null;
  notes: string | null;
  created_at: string;
};

/** Expert review of submitted letter labels, and the honest accuracy measurement. */
function GlyphReview() {
  const [script, setScript] = useState("thamudic");
  const [labels, setLabels] = useState<PendingLabel[]>([]);
  const [evalNote, setEvalNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (s = script) => {
    setBusy(true);
    const res = await glyphReview({ action: "list", script: s });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not load the label queue.");
      return;
    }
    setLabels((res.pending ?? []) as PendingLabel[]);
  };

  useEffect(() => {
    void load(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const decide = async (ids: string[], decision: "approved" | "rejected") => {
    const res = await glyphReview({ action: "decide", ids, decision });
    if (!res.ok) {
      toast.error(res.error ?? "Could not record the decision.");
      return;
    }
    toast.success(`${ids.length} label(s) ${decision}.`);
    setLabels((l) => l.filter((x) => !ids.includes(x.id)));
  };

  const evaluate = async () => {
    setBusy(true);
    const res = await glyphReview({ action: "evaluate", script });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Measurement failed.");
      return;
    }
    setEvalNote(
      res.state === "insufficient_data"
        ? (res.message ?? "Not enough approved examples.")
        : `Leave-one-out accuracy ${((res.accuracy ?? 0) * 100).toFixed(1)}% over ${res.exemplars} approved example(s) covering ${res.letters} letter(s). Same-photograph examples are included, so accuracy on new photographs is lower.`,
    );
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="font-bold">Letter label review ({labels.length} pending)</h2>
      <p className="text-sm text-muted-foreground">
        Labels submitted from the letter detector carry only shape measurements and provenance.
        Approving one adds it to the matcher's example set; nothing is used before approval, and no
        neural network is trained.
      </p>
      <div className="flex flex-wrap gap-2">
        {["thamudic", "dadanitic", "nabataean", "other"].map((s) => (
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
        <Button size="sm" onClick={() => void evaluate()} disabled={busy}>
          Measure accuracy
        </Button>
      </div>
      {evalNote && <p className="rounded-lg bg-muted p-3 text-sm">{evalNote}</p>}
      {labels.length === 0 && (
        <p className="text-sm text-muted-foreground">No labels awaiting review for this script.</p>
      )}
      {labels.map((l) => (
        <article key={l.id} className="rounded-xl border border-border p-3 text-sm">
          <p className="font-semibold">
            {l.letter}
            {l.transliteration ? ` / ${l.transliteration}` : ""}
          </p>
          <p className="text-muted-foreground">
            {new Date(l.created_at).toLocaleString()}
            {l.provenance ? ` · ${l.provenance}` : " · no provenance given"}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void decide([l.id], "approved")}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => void decide([l.id], "rejected")}>
              Reject
            </Button>
          </div>
        </article>
      ))}
      {labels.length > 1 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void decide(
              labels.map((l) => l.id),
              "approved",
            )
          }
        >
          Approve all listed
        </Button>
      )}
    </section>
  );
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Athar Administrator — Correction Review" },
      {
        name: "description",
        content:
          "Administrator workflow for reviewing user corrections to inscription readings and importing licensed reference data into the Athar knowledge base.",
      },
      { property: "og:title", content: "Athar Administrator — Correction Review" },
      {
        property: "og:description",
        content: "Review corrections and manage licensed reference data for Athar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type Pending = { project: AtharProject; version: ReadingVersion };

function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [refs, setRefs] = useState<{ name: string; records: number } | null>(null);
  const [corpus, setCorpus] = useState<{ source: string; version: string; records: number } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminLoggedIn()) {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refreshCorpus();
    void listProjects().then((all) =>
      setPending(
        all.flatMap((project) =>
          project.versions
            .filter((v) => v.source === "user")
            .map((version) => ({ project, version })),
        ),
      ),
    );
  }, [authed]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    const pinRes = verifyAdminPin(password);
    const serverRes = await adminLogin(password).catch(() => ({ ok: false, error: undefined }));
    setPassword("");

    if (pinRes.success || serverRes.ok) {
      setAuthed(true);
      setError(null);
      toast.success(pinRes.success ? pinRes.message : "تم تسجيل دخول المشرف بنجاح");
    } else {
      const err = pinRes.message || serverRes.error || "Login failed.";
      setError(err);
      toast.error(err);
    }
  };

  const handleLogout = () => {
    adminLogout();
    setAuthed(false);
    toast.success("تم تسجيل الخروج");
  };

  const importRefs = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as unknown;
      const records = Array.isArray(data) ? data.length : Object.keys(data as object).length;
      setRefs({ name: file.name, records });
      toast.success(
        `Loaded ${records} licensed reference record(s) for this session. Persisting them across sessions requires a database.`,
      );
    } catch {
      toast.error("That file is not valid JSON.");
    }
  };

  const refreshCorpus = async () => {
    const res = await referenceStatus();
    setCorpus(res.collection ?? null);
  };

  const importCorpus = async () => {
    setImporting(true);
    setImportLog("Starting import…");
    try {
      let offset = 0;
      let done = false;
      let imported = 0;
      while (!done) {
        const res = await importReferences({ offset, limit: 4000 });
        if (!res.ok) {
          setImportLog(res.error ?? "Import failed.");
          toast.error(res.error ?? "Import failed.");
          return;
        }
        imported += res.imported ?? 0;
        offset = res.nextOffset ?? offset;
        done = Boolean(res.done);
        setImportLog(`Imported ${imported.toLocaleString()} records so far…`);
      }
      setImportLog(`Import finished: ${imported.toLocaleString()} records processed.`);
      toast.success("Reference corpus imported.");
      await refreshCorpus();
    } catch {
      setImportLog("The import could not be completed. Retry to resume.");
      toast.error("The import could not be completed.");
    } finally {
      setImporting(false);
    }
  };

  const exportApproved = () => {
    const payload = pending
      .filter((p) => approved.includes(p.version.id))
      .map((p) => ({
        approvedAt: new Date().toISOString(),
        projectName: p.project.name,
        provenance: {
          source: "user correction (Athar shared-PIN session)",
          consentToReuse: p.project.consentToShare,
          correctedAt: new Date(p.version.createdAt).toISOString(),
        },
        machineSuggestion: p.project.machineReading?.proposedReading ?? null,
        correction: p.version.text ?? "",
        reason: p.version.reason ?? "",
        pipelineVersion: "athar-analysis-1",
        referenceCollectionVersion: refs ? `import:${refs.name}` : "builtin-links-1",
      }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "athar-approved-corrections.json";
    a.click();
  };

  if (!authed)
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold">Administrator access</h1>
          <LangButton />
        </div>
        <LanguageSelector />
        <p className="text-sm text-muted-foreground">
          Administrator sign-in for فهد (Fahad). Only a secure hash of this password is stored, and
          repeated failed attempts lock sign-in for a while.
        </p>
        <form onSubmit={login} className="panel space-y-3 p-5">
          <Label htmlFor="pw">Administrator password</Label>
          <Input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg">
            Sign in
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </main>
    );

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck /> Correction review
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs"
          >
            <LogOut className="size-3.5" /> الخروج
          </Button>
          <LangButton />
        </div>
      </div>
      <div className="panel p-3">
        <LanguageSelector />
      </div>
      <p className="panel p-3 text-sm text-muted-foreground">
        Pipeline version <code>athar-analysis-1</code> · reference collection{" "}
        <code>{refs ? `import:${refs.name}` : "builtin-links-1"}</code>. Approving a correction
        exports it with provenance for the knowledge base; it does not retrain any model — no
        automatic learning is implemented. Evaluate updates against independent, expert-reviewed
        examples before adopting them, and keep the previous export to roll back.
      </p>

      <section className="panel space-y-2 p-4">
        <h2 className="font-bold">OCIANA reference corpus</h2>
        <p className="text-sm text-muted-foreground">
          Imports the official OCIANA corpus file published in the Oxford Research Archive (37,955
          records with transliterations, translations and record links) into the server reference
          library, which the reading feature searches for comparable published inscriptions. The
          archive's terms of use do not grant an open licence, so records keep their source
          attribution and links, and no redistribution permission is claimed. This is a comparison
          corpus, not an image-reading service.
        </p>
        <p className="text-sm">
          Current library:{" "}
          {corpus
            ? `${corpus.source} ${corpus.version} — ${corpus.records.toLocaleString()} records`
            : "empty"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void importCorpus()} disabled={importing}>
            {importing ? "Importing…" : "Import OCIANA corpus"}
          </Button>
          <Button variant="outline" onClick={() => void refreshCorpus()} disabled={importing}>
            Refresh status
          </Button>
        </div>
        {importLog && <p className="text-sm text-muted-foreground">{importLog}</p>}
      </section>

      <section className="panel space-y-2 p-4">
        <h2 className="font-bold">Import licensed reference data</h2>
        <p className="text-sm text-muted-foreground">
          OCIANA (ociana.osu.edu) and DASI publish no documented public API, so reference records
          cannot be pulled automatically. Import a JSON export you are licensed to reuse.
        </p>
        <Label htmlFor="refs" className="sr-only">
          Reference JSON
        </Label>
        <div className="flex items-center gap-2">
          <Upload className="size-4" />
          <Input
            id="refs"
            type="file"
            accept="application/json"
            onChange={(e) => void importRefs(e.target.files?.[0])}
          />
        </div>
      </section>

      <AccessManagement />

      <WorkerSetup />

      <ReconJobs />

      <ExtensionsScripts />

      <FeedbackInbox />

      <AdminPassword />

      <AiSettings />

      <ResearchLibrary />

      <CorrectionsReview />

      <CorpusLabeller />

      <GlyphReview />

      <ModelTraining />

      <section className="space-y-3">
        <h2 className="font-bold">Pending corrections ({pending.length})</h2>
        {pending.length === 0 && (
          <p className="panel p-4 text-sm text-muted-foreground">
            No corrections found in this browser's local projects. Corrections are stored per
            device; a shared review queue would require a server database.
          </p>
        )}
        {pending.map(({ project, version }) => (
          <article key={version.id} className="panel space-y-2 p-4">
            <p className="text-sm text-muted-foreground">
              {project.name} · {new Date(version.createdAt).toLocaleString()} · consent to reuse:{" "}
              {project.consentToShare ? "given" : "not given"}
            </p>
            {project.machineReading && (
              <p className="text-sm">
                <strong>Machine:</strong> {project.machineReading.proposedReading}
              </p>
            )}
            <p className="text-sm">
              <strong>Correction:</strong> {version.text}
            </p>
            {version.reason && (
              <p className="text-sm text-muted-foreground">Reason: {version.reason}</p>
            )}
            <Button
              size="sm"
              variant={approved.includes(version.id) ? "default" : "outline"}
              disabled={!project.consentToShare}
              onClick={() =>
                setApproved((a) =>
                  a.includes(version.id) ? a.filter((x) => x !== version.id) : [...a, version.id],
                )
              }
            >
              <Check /> {approved.includes(version.id) ? "Approved" : "Approve for knowledge base"}
            </Button>
            {!project.consentToShare && (
              <p className="text-xs text-muted-foreground">
                Cannot be reused: the contributor did not consent.
              </p>
            )}
          </article>
        ))}
        {approved.length > 0 && (
          <Button onClick={exportApproved}>
            <Download /> Export {approved.length} approved correction(s)
          </Button>
        )}
      </section>
    </main>
  );
}
