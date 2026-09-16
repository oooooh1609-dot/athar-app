/**
 * Messages & Feedback inbox for the administrator: read submissions, reply and
 * move each conversation through New → In Review → Planned → Resolved / Closed.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import {
  adminInbox,
  adminReply,
  adminSetStatus,
  adminThread,
  type FeedbackStatus,
  type StatusEvent,
  type ThreadMessage,
  type ThreadSummary,
} from "@/lib/feedback-client";

const STATUSES: FeedbackStatus[] = ["new", "in_review", "planned", "resolved", "closed"];
const LABEL: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
  contact_admin: "Contact Admin",
  problem: "Problem",
  improvement: "Improvement",
};

export function FeedbackInbox() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    thread: ThreadSummary;
    messages: ThreadMessage[];
    history: StatusEvent[];
  } | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await adminInbox(filter === "all" ? undefined : filter);
    if (!res.ok) {
      setError(res.error ?? "Could not load messages.");
      return;
    }
    setThreads(res.threads ?? []);
    setCounts(res.counts ?? {});
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    const res = await adminThread(id);
    if (res.ok && res.thread && res.messages)
      setDetail({ thread: res.thread, messages: res.messages, history: res.history ?? [] });
  };

  if (openId)
    return (
      <section className="grid gap-3">
        <button
          onClick={() => {
            setOpenId(null);
            void load();
          }}
          className="flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="size-4" /> Back to inbox
        </button>
        {!detail && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        {detail && (
          <>
            <div className="panel p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
                {LABEL[detail.thread.category]}
              </p>
              <h3 className="mt-1 font-bold">{detail.thread.subject}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {detail.thread.email} · {LABEL[detail.thread.status]}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={busy || detail.thread.status === s}
                    onClick={async () => {
                      setBusy(true);
                      await adminSetStatus(detail.thread.id, s);
                      setBusy(false);
                      await open(detail.thread.id);
                    }}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
                      detail.thread.status === s
                        ? "bg-primary text-primary-foreground"
                        : "border border-input"
                    }`}
                  >
                    {LABEL[s]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Suggestions are recorded for your review; they never change the application or train
                anything automatically.
              </p>
            </div>

            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={`panel p-3 ${m.sender === "admin" ? "border-accent/50 bg-accent/5" : ""}`}
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {m.sender === "admin" ? "You" : detail.thread.email} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                {m.screenshotUrl && (
                  <img
                    src={m.screenshotUrl}
                    alt="Attached screenshot"
                    className="mt-2 max-h-64 rounded-lg border border-border object-contain"
                  />
                )}
              </div>
            ))}

            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await adminReply(detail.thread.id, reply);
                setBusy(false);
                if (!res.ok) {
                  setError(res.error ?? "Could not send the reply.");
                  return;
                }
                setReply("");
                await open(detail.thread.id);
              }}
            >
              <textarea
                required
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to this person"
                className="rounded-lg border border-input bg-background p-3 text-sm"
              />
              <button
                disabled={busy}
                className="min-h-11 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
              >
                Send reply
              </button>
            </form>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </section>
    );

  return (
    <section className="panel p-4">
      <h2 className="text-lg font-bold">Messages &amp; Feedback</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
              filter === s ? "bg-primary text-primary-foreground" : "border border-input"
            }`}
          >
            {s === "all" ? "All" : `${LABEL[s]} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {threads.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p>
      )}
      <ul className="mt-3 grid gap-2">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => void open(t.id)}
              className="w-full rounded-lg border border-border p-3 text-left hover:border-primary"
            >
              <span className="block truncate font-semibold">{t.subject}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {t.email} · {LABEL[t.category]} · {LABEL[t.status]} ·{" "}
                {new Date(t.updated_at).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
