import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { extensionsAdmin, type ExtensionRecord, type ExtensionRun } from "@/lib/athar-api";
import { runBrowserExtension } from "@/lib/extension-sandbox";
import { EXTENSION_CONTRACT_VERSION } from "@/lib/extension-contract";

/**
 * Administrator screen for extensions and scripts.
 *
 * Imported code is reviewed here, tested for real inside an isolated worker,
 * and only then enabled. Nothing is executed automatically, extensions never
 * see the administrator session, private storage or any secret, and an
 * external program such as Meshroom stays unavailable until its own worker
 * connects.
 */

type Tab = "installed" | "add" | "source" | "logs";

/** A small synthetic sample so "Test on sample" processes real pixels. */
function samplePixels(w = 160, h = 120) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const band = 60 + Math.round(120 * (x / w));
      const mark = (x + y) % 37 < 4 ? -45 : 0;
      const v = Math.max(0, Math.min(255, band + mark));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

export function ExtensionsScripts() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("installed");
  const [rows, setRows] = useState<ExtensionRecord[]>([]);
  const [runs, setRuns] = useState<ExtensionRun[]>([]);
  const [workerOnline, setWorkerOnline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const [manifestText, setManifestText] = useState("");
  const [moduleText, setModuleText] = useState("");
  const [secretName, setSecretName] = useState("");

  const [src, setSrc] = useState({
    name: "",
    sourceUrl: "",
    purpose: "",
    license: "",
    requirements: "",
    endpoint: "",
    runtime: "external_worker" as ExtensionRecord["runtime"],
    needsPaidService: false,
  });

  const load = async () => {
    const res = await extensionsAdmin({ action: "list" });
    if (!res.ok) {
      toast.error(res.error ?? "Could not read the extensions.");
      return;
    }
    setRows(res.extensions ?? []);
    setWorkerOnline(Boolean(res.workerOnline));
  };

  const loadLogs = async () => {
    const res = await extensionsAdmin({ action: "logs", limit: 80 });
    if (res.ok) setRuns(res.runs ?? []);
  };

  useEffect(() => {
    void load();
    void loadLogs();
  }, []);

  const statusLabel = (s: ExtensionRecord["status"]) => t(`ext.status.${s}`);
  const runtimeLabel = (r: ExtensionRecord["runtime"]) => t(`ext.runtime.${r}`);

  const tone: Record<ExtensionRecord["status"], string> = useMemo(
    () => ({
      imported: "bg-muted text-muted-foreground",
      validated: "bg-muted text-muted-foreground",
      tested: "bg-primary/15 text-primary",
      enabled: "bg-primary text-primary-foreground",
      disabled: "bg-muted text-muted-foreground",
      failed: "bg-destructive/15 text-destructive",
    }),
    [],
  );

  /** Runs a browser extension on the synthetic sample and records the outcome. */
  const test = async (row: ExtensionRecord) => {
    if (row.runtime !== "browser" || !row.module_source) {
      toast.info(t("ext.testUnavailable"));
      return;
    }
    setBusy(row.id);
    const params: Record<string, number | boolean | string> = {};
    for (const p of row.manifest.params ?? []) params[p.key] = p.default;
    const run = runBrowserExtension({
      moduleSource: row.module_source,
      image: samplePixels(),
      params,
      timeoutMs: 20000,
    });
    const result = await run.result;
    const note = result.ok
      ? `processed ${result.width}×${result.height} pixels in ${result.ms} ms`
      : result.error;
    await extensionsAdmin({
      action: "record-test",
      id: row.id,
      passed: result.ok,
      note,
      durationMs: result.ms,
    });
    setBusy(null);
    if (result.ok) toast.success(t("ext.testPassed", { ms: String(result.ms) }));
    else toast.error(t("ext.testFailed", { error: result.error }));
    await load();
    await loadLogs();
  };

  const act = async (
    row: ExtensionRecord,
    action: "enable" | "disable" | "rollback" | "remove",
  ) => {
    setBusy(row.id);
    const res = await extensionsAdmin({ action, id: row.id });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Action failed.");
      return;
    }
    toast.success(
      action === "enable"
        ? t("ext.enabled")
        : action === "disable"
          ? t("ext.disabled")
          : action === "remove"
            ? t("ext.removed")
            : t("ext.rolledBack"),
    );
    await load();
    await loadLogs();
  };

  const importExt = async () => {
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      toast.error(t("ext.badJson"));
      return;
    }
    setBusy("import");
    const res = await extensionsAdmin({
      action: "import",
      manifest,
      ...(moduleText.trim() ? { moduleSource: moduleText } : {}),
      ...(secretName.trim() ? { secretName: secretName.trim() } : {}),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(t("ext.invalid", { errors: (res.errors ?? [res.error ?? ""]).join(" · ") }));
      return;
    }
    toast.success(res.note ?? "Imported for review.");
    setManifestText("");
    setModuleText("");
    setSecretName("");
    setTab("installed");
    await load();
    await loadLogs();
  };

  const registerSource = async () => {
    setBusy("source");
    const res = await extensionsAdmin({
      action: "register-source",
      name: src.name,
      sourceUrl: src.sourceUrl,
      purpose: src.purpose,
      license: src.license,
      runtime: src.runtime,
      needsPaidService: src.needsPaidService,
      ...(src.requirements ? { requirements: src.requirements } : {}),
      ...(src.endpoint ? { endpoint: src.endpoint } : {}),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(t("ext.invalid", { errors: (res.errors ?? [res.error ?? ""]).join(" · ") }));
      return;
    }
    toast.success(res.note ?? "Source registered for review.");
    setSrc({ ...src, name: "", sourceUrl: "", purpose: "", endpoint: "" });
    setTab("installed");
    await load();
    await loadLogs();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "installed", label: t("ext.tab.installed") },
    { id: "add", label: t("ext.tab.add") },
    { id: "source", label: t("ext.tab.worker") },
    { id: "logs", label: t("ext.tab.logs") },
  ];

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t("ext.title")}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void load();
            void loadLogs();
          }}
        >
          <RefreshCw /> {t("ext.refresh")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("ext.intro")}</p>
      <p className="text-xs text-muted-foreground">{t("ext.lifecycle")}</p>

      <div className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <Button
            key={x.id}
            size="sm"
            variant={tab === x.id ? "default" : "outline"}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </Button>
        ))}
      </div>

      {tab === "installed" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("ext.sandbox")}</p>
          <p className="text-xs text-muted-foreground">{t("ext.savedSeparately")}</p>
          {rows.map((row) => {
            const unavailable = row.runtime === "external_worker" && !workerOnline;
            return (
              <article
                key={row.id}
                className="space-y-2 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {row.name}{" "}
                    <span className="text-muted-foreground">
                      · {t("ext.field.version")} {row.version} · {runtimeLabel(row.runtime)}
                    </span>
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tone[row.status]}`}>
                    {statusLabel(row.status)}
                  </span>
                </div>
                <p className="text-muted-foreground">{row.purpose}</p>
                <p className="text-xs text-muted-foreground">
                  {t("ext.field.license")}: {row.license} ·{" "}
                  {row.needs_paid_service ? t("ext.paid") : t("ext.free")}
                  {row.requirements ? ` · ${t("ext.field.requirements")}: ${row.requirements}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("ext.field.inputs")}: {row.manifest.inputs.join(", ")} ·{" "}
                  {t("ext.field.outputs")}: {row.manifest.outputs.join(", ")} ·{" "}
                  {t("ext.field.permissions")}: {row.manifest.permissions.join(", ")} ·{" "}
                  {t("ext.field.surfaces")}: {row.manifest.surfaces.join(", ")}
                </p>
                {row.source_url && (
                  <p className="text-xs">
                    {t("ext.field.source")}:{" "}
                    <a className="underline" href={row.source_url} target="_blank" rel="noreferrer">
                      {row.source_url}
                    </a>
                  </p>
                )}
                {row.endpoint && (
                  <p className="text-xs text-muted-foreground">
                    {t("ext.field.endpoint")}: {row.endpoint}
                  </p>
                )}
                {row.secret_name && (
                  <p className="text-xs text-muted-foreground">
                    {t("ext.add.secret")}: {row.secret_name}
                  </p>
                )}
                {unavailable && <p className="text-xs text-destructive">{t("ext.unavailable")}</p>}
                {row.runtime === "external_worker" && workerOnline && (
                  <p className="text-xs text-primary">{t("ext.available")}</p>
                )}
                {row.last_test_note && (
                  <p className="text-xs text-muted-foreground">{row.last_test_note}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === row.id}
                    onClick={() => void test(row)}
                  >
                    {busy === row.id ? t("ext.testing") : t("ext.action.test")}
                  </Button>
                  {row.status === "enabled" ? (
                    <Button size="sm" variant="outline" onClick={() => void act(row, "disable")}>
                      {t("ext.action.disable")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={unavailable}
                      onClick={() => void act(row, "enable")}
                    >
                      {t("ext.action.enable")}
                    </Button>
                  )}
                  {Boolean(row.previous_version) && (
                    <Button size="sm" variant="outline" onClick={() => void act(row, "rollback")}>
                      {t("ext.action.rollback")}
                    </Button>
                  )}
                  {row.module_source && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReviewing(reviewing === row.id ? null : row.id)}
                    >
                      {t("ext.action.review")}
                    </Button>
                  )}
                  {!row.builtin && (
                    <Button size="sm" variant="outline" onClick={() => void act(row, "remove")}>
                      {t("ext.action.remove")}
                    </Button>
                  )}
                </div>
                {reviewing === row.id && row.module_source && (
                  <pre
                    dir="ltr"
                    className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-4"
                  >
                    {row.module_source}
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === "add" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("ext.add.note")}</p>
          <p className="text-xs text-muted-foreground">
            {t("ext.add.contract")} (v{EXTENSION_CONTRACT_VERSION})
          </p>
          <div>
            <Label htmlFor="ext-manifest">{t("ext.add.manifest")}</Label>
            <Textarea
              id="ext-manifest"
              dir="ltr"
              rows={8}
              className="mt-2 font-mono text-xs"
              value={manifestText}
              onChange={(e) => setManifestText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ext-module">{t("ext.add.module")}</Label>
            <Textarea
              id="ext-module"
              dir="ltr"
              rows={8}
              className="mt-2 font-mono text-xs"
              value={moduleText}
              onChange={(e) => setModuleText(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ext-secret">{t("ext.add.secret")}</Label>
            <Input
              id="ext-secret"
              className="mt-2"
              value={secretName}
              onChange={(e) => setSecretName(e.target.value)}
            />
          </div>
          <Button disabled={busy === "import"} onClick={() => void importExt()}>
            {t("ext.add.submit")}
          </Button>
        </div>
      )}

      {tab === "source" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t("ext.source.note")}</p>
          <p className="text-xs text-muted-foreground">{t("ext.worker.note")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="src-name">{t("ext.source.name")}</Label>
              <Input
                id="src-name"
                className="mt-2"
                value={src.name}
                onChange={(e) => setSrc({ ...src, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="src-url">{t("ext.source.url")}</Label>
              <Input
                id="src-url"
                dir="ltr"
                className="mt-2"
                value={src.sourceUrl}
                onChange={(e) => setSrc({ ...src, sourceUrl: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="src-license">{t("ext.source.license")}</Label>
              <Input
                id="src-license"
                className="mt-2"
                value={src.license}
                onChange={(e) => setSrc({ ...src, license: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="src-endpoint">{t("ext.source.endpoint")}</Label>
              <Input
                id="src-endpoint"
                dir="ltr"
                className="mt-2"
                value={src.endpoint}
                onChange={(e) => setSrc({ ...src, endpoint: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="src-purpose">{t("ext.source.purpose")}</Label>
            <Textarea
              id="src-purpose"
              rows={3}
              className="mt-2"
              value={src.purpose}
              onChange={(e) => setSrc({ ...src, purpose: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="src-req">{t("ext.source.requirements")}</Label>
            <Textarea
              id="src-req"
              rows={2}
              className="mt-2"
              value={src.requirements}
              onChange={(e) => setSrc({ ...src, requirements: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="src-runtime">{t("ext.source.runtime")}</Label>
            <select
              id="src-runtime"
              className="rounded-md border border-border bg-background p-2 text-sm"
              value={src.runtime}
              onChange={(e) =>
                setSrc({ ...src, runtime: e.target.value as ExtensionRecord["runtime"] })
              }
            >
              <option value="browser">{t("ext.runtime.browser")}</option>
              <option value="backend">{t("ext.runtime.backend")}</option>
              <option value="external_worker">{t("ext.runtime.external_worker")}</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={src.needsPaidService}
                onChange={(e) => setSrc({ ...src, needsPaidService: e.target.checked })}
              />
              {t("ext.source.paid")}
            </label>
          </div>
          <Button disabled={busy === "source"} onClick={() => void registerSource()}>
            {t("ext.source.submit")}
          </Button>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{t("ext.logs.note")}</p>
          {runs.length === 0 ? (
            <p className="text-muted-foreground">{t("ext.logs.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {runs.map((r) => (
                <li key={r.id} className="rounded border border-border p-2 text-xs">
                  <span className="font-medium">{r.event}</span> · v{r.extension_version} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                  {r.duration_ms !== null ? ` · ${r.duration_ms} ms` : ""}
                  {r.surface ? ` · ${r.surface}` : ""}
                  {r.detail ? (
                    <span className="block text-muted-foreground">{r.detail}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
