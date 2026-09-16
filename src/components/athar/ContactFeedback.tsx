/**
 * Contact & Feedback: send a message to the administrator, report a problem or
 * suggest an improvement, then follow the reply in "My Messages".
 *
 * Suggestions are stored for the administrator to review. They do not change the
 * application automatically and are not used to train anything.
 *
 * All visible text comes from the interface dictionary, so the screen follows the
 * language the user selected.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Paperclip, Send } from "lucide-react";

import {
  myThread,
  myThreads,
  replyToThread,
  submitFeedback,
  type FeedbackCategory,
  type StatusEvent,
  type ThreadMessage,
  type ThreadSummary,
} from "@/lib/feedback-client";
import { useI18n } from "@/lib/i18n";

const CATEGORY_IDS: FeedbackCategory[] = ["contact_admin", "problem", "improvement"];
const STATUS_IDS = ["new", "in_review", "planned", "resolved", "closed"] as const;

export function unreadReplies(threads: ThreadSummary[]) {
  return threads.filter(
    (t) =>
      t.last_admin_reply_at &&
      (!t.user_seen_at || new Date(t.user_seen_at) < new Date(t.last_admin_reply_at)),
  ).length;
}

export function ContactFeedback({
  contactOnly = false,
  onUnreadChange,
}: {
  contactOnly?: boolean;
  onUnreadChange?: (n: number) => void;
}) {
  const { t, d } = useI18n();
  const [category, setCategory] = useState<FeedbackCategory>("contact_admin");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    thread: ThreadSummary;
    messages: ThreadMessage[];
    history: StatusEvent[];
  } | null>(null);
  const [reply, setReply] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const categoryLabel = (id: string) =>
    (CATEGORY_IDS as string[]).includes(id) ? t(`fb.cat.${id}` as never) : id;
  const statusLabel = (id: string) =>
    (STATUS_IDS as readonly string[]).includes(id) ? t(`fb.status.${id}` as never) : id;

  const load = useCallback(async () => {
    const res = await myThreads();
    if (res.ok && res.threads) {
      setThreads(res.threads);
      onUnreadChange?.(res.unread ?? unreadReplies(res.threads));
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const openThread = async (id: string) => {
    setOpenId(id);
    setDetail(null);
    const res = await myThread(id);
    if (res.ok && res.thread && res.messages)
      setDetail({ thread: res.thread, messages: res.messages, history: res.history ?? [] });
    void load();
  };

  const pickScreenshot = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError(t("fb.tooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(String(reader.result));
    reader.readAsDataURL(file);
  };

  if (openId)
    return (
      <div className="grid gap-3">
        <button
          onClick={() => {
            setOpenId(null);
            setDetail(null);
          }}
          className="flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="size-4" /> {t("fb.back")}
        </button>
        {!detail && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        {detail && (
          <>
            <div className="panel p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
                {categoryLabel(detail.thread.category)}
              </p>
              <h3 className="mt-1 font-bold">{detail.thread.subject}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("fb.status")}: {statusLabel(detail.thread.status)}
              </p>
            </div>
            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={`panel p-3 ${m.sender === "admin" ? "border-accent/50 bg-accent/5" : ""}`}
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  {m.sender === "admin" ? t("fb.administrator") : t("fb.you")} · {d(m.createdAt)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                {m.screenshotUrl && (
                  <img
                    src={m.screenshotUrl}
                    alt={t("fb.attachedAlt")}
                    className="mt-2 max-h-64 rounded-lg border border-border object-contain"
                  />
                )}
              </div>
            ))}
            {detail.history.length > 0 && (
              <div className="panel p-3">
                <p className="text-xs font-semibold text-muted-foreground">{t("fb.history")}</p>
                <ul className="mt-1 grid gap-1 text-xs text-muted-foreground">
                  {detail.history.map((h, i) => (
                    <li key={i}>
                      {d(h.created_at)} — {statusLabel(h.to_status)}
                      {h.note ? `: ${h.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.thread.status !== "closed" && (
              <form
                className="grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const res = await replyToThread(detail.thread.id, reply);
                  setBusy(false);
                  if (!res.ok) {
                    setError(res.error ?? t("fb.replyFailed"));
                    return;
                  }
                  setReply("");
                  await openThread(detail.thread.id);
                }}
              >
                <textarea
                  required
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t("fb.replyPlaceholder")}
                  className="rounded-lg border border-input bg-background p-3 text-sm"
                />
                <button
                  disabled={busy}
                  className="min-h-11 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {t("fb.sendReply")}
                </button>
              </form>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="panel p-4">
        <h2 className="text-lg font-bold">{t("fb.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("fb.intro")}</p>
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            const res = await submitFeedback({
              category,
              subject,
              message,
              ...(screenshot ? { screenshot } : {}),
            });
            setBusy(false);
            if (!res.ok) {
              setError(res.error ?? t("fb.saveFailed"));
              return;
            }
            setNotice(res.screenshotSkipped ? t("fb.savedNoShot") : t("fb.saved"));
            setSubject("");
            setMessage("");
            setScreenshot(null);
            if (fileRef.current) fileRef.current.value = "";
            await load();
          }}
        >
          <div className="grid gap-1">
            {CATEGORY_IDS.filter((c) => !contactOnly || c === "contact_admin").map((c) => (
              <label
                key={c}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${
                  category === c ? "border-primary bg-secondary" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  className="mt-1"
                  checked={category === c}
                  onChange={() => setCategory(c)}
                />
                <span>
                  <span className="block font-semibold">{categoryLabel(c)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`fb.hint.${c}` as never)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <input
            required
            maxLength={160}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("fb.subject")}
            className="min-h-11 rounded-lg border border-input bg-background px-3"
          />
          <textarea
            required
            rows={4}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("fb.message")}
            className="rounded-lg border border-input bg-background p-3 text-sm"
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 text-sm text-muted-foreground">
            <Paperclip className="size-4" />
            {screenshot ? t("fb.attached") : t("fb.attach")}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickScreenshot(f);
              }}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm font-semibold text-primary">{notice}</p>}
          <button
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("fb.submit")}
          </button>
        </form>
      </div>

      <div className="panel p-4">
        <h3 className="font-bold">{t("fb.myMessages")}</h3>
        {threads.length === 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{t("fb.none")}</p>
        )}
        <ul className="mt-2 grid gap-2">
          {threads.map((th) => {
            const unread =
              th.last_admin_reply_at &&
              (!th.user_seen_at || new Date(th.user_seen_at) < new Date(th.last_admin_reply_at));
            return (
              <li key={th.id}>
                <button
                  onClick={() => void openThread(th.id)}
                  className="w-full rounded-lg border border-border p-3 text-start hover:border-primary"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{th.subject}</span>
                    {unread && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                        {t("fb.newReply")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {categoryLabel(th.category)} · {statusLabel(th.status)} · {d(th.updated_at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
