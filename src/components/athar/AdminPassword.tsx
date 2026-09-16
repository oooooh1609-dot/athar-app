/** Lets the administrator change their own password. Verified on the server. */

import { useState } from "react";
import { KeyRound } from "lucide-react";

export function AdminPassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="panel p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound className="size-4" /> Administrator password
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only a secure hash of the password is stored. Enter the current password to set a new one.
      </p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setNotice(null);
          const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "change", password: current, newPassword: next }),
          });
          const data = (await res.json()) as { ok: boolean; error?: string };
          setBusy(false);
          if (!data.ok) {
            setError(data.error ?? "Could not change the password.");
            return;
          }
          setCurrent("");
          setNext("");
          setNotice("Password changed. Use the new password next time you sign in.");
        }}
      >
        <input
          type="password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          className="min-h-11 rounded-lg border border-input bg-background px-3"
        />
        <input
          type="password"
          required
          minLength={4}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password"
          className="min-h-11 rounded-lg border border-input bg-background px-3"
        />
        <button
          disabled={busy}
          className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : "Change"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {notice && <p className="mt-2 text-sm font-semibold text-primary">{notice}</p>}
    </section>
  );
}
