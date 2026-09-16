/**
 * Entry to Athar with a code issued by the administrator.
 *
 * There is no public sign-up and no shared PIN: the administrator creates a
 * code, hands it to a person, and that code opens the app. The server checks
 * the code on every request, so a revoked or expired code stops working at
 * once.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { checkAccess, enterCode } from "@/lib/code-access-client";
import { installAuthFetch } from "@/lib/auth-fetch";
import { useI18n } from "@/lib/i18n";
import { LangButton } from "@/components/athar/LangButton";
import { LanguageSelector } from "@/components/athar/LanguageSelector";

export function DevelopmentNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  if (compact)
    return (
      <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
        {t("dev.badge")}
      </span>
    );
  return (
    <div className="panel p-3 text-center">
      <p className="text-sm font-semibold text-accent">{t("dev.badge")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("dev.body")}</p>
    </div>
  );
}

export type Visitor = { label: string | null };

export function AuthGate({ children }: { children: (visitor: Visitor) => React.ReactNode }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"loading" | "code" | "ready">("loading");
  const [label, setLabel] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await checkAccess();
      setLabel(res.label ?? null);
      setPhase(res.signedIn ? "ready" : "code");
    } catch {
      setPhase("code");
    }
  }, []);

  useEffect(() => {
    installAuthFetch();
    void refresh();
  }, [refresh]);

  if (phase === "loading")
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );

  if (phase === "ready") return <>{children({ label })}</>;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-2 flex justify-end">
          <LangButton />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <span className="font-display text-xl leading-none">A</span>
          </span>
          <h1 className="font-display text-2xl font-bold tracking-[0.18em] text-primary uppercase">
            {t("app.name")}
          </h1>
          <DevelopmentNotice compact />
        </div>

        {/* Language choice before anything else, so the welcome screen itself can be read. */}
        <div className="panel mt-6 p-4">
          <LanguageSelector />
        </div>

        <div className="panel mt-3 p-5">
          <h2 className="text-lg font-bold">{t("auth.title")}</h2>
          <form
            className="mt-3 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const res = await enterCode(code.trim());
              setBusy(false);
              if (!res.ok) {
                setError(res.error ?? t("auth.incorrect"));
                return;
              }
              setCode("");
              await refresh();
            }}
          >
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-accent" />
              {t("auth.private")}
            </p>
            <input
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-2345"
              dir="ltr"
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-center font-mono tracking-[0.25em]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? t("auth.checking") : t("auth.continue")}
            </button>
            <a href="/admin" className="text-center text-xs text-muted-foreground underline">
              {t("auth.adminSignin")}
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
