/**
 * "Ask Athar AI" — research-grounded assistant surface.
 *
 * Three entry points: a free question, analysis of a photograph, and research on
 * a typed inscription. Every answer comes from the server endpoint, which
 * retrieves real evidence first. Published evidence and AI inference are shown
 * separately, and no confidence score is displayed because none is produced.
 */

import { useRef, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ask, type AskAnswerView, type AskSource } from "@/lib/ask-client";
import { LANGS, langInfo, useI18n, type UiLang } from "@/lib/i18n";

type Task = "question" | "image" | "reading";
type Mode = "quick" | "detailed";
type Lang = UiLang;

const SCRIPTS = [
  ["auto", "Auto"],
  ["thamudic", "Thamudic"],
  ["dadanitic", "Dadanitic / Lihyanite"],
  ["nabataean", "Nabataean"],
  ["musnad", "Musnad (OSA)"],
  ["other", "Other"],
] as const;

const DEPTH_LABEL: Record<AskSource["depth"], string> = {
  page_text: "retrieved page text",
  abstract: "abstract only",
  metadata_only: "bibliographic metadata only",
  record: "database record",
};

const KIND_LABEL: Record<AskSource["kind"], string> = {
  document: "Research library (uploaded PDF)",
  corpus: "Published inscription record",
  alphabet: "Alphabet pack (reference data)",
  web: "External scholarly search",
};

export function AskAthar({ projectContext }: { projectContext?: string }) {
  const { t, lang: uiLang } = useI18n();
  const [task, setTask] = useState<Task>("question");
  const [mode, setMode] = useState<Mode>("quick");
  const [lang, setLang] = useState<Lang>(uiLang);
  const [script, setScript] = useState<string>("auto");
  const [question, setQuestion] = useState("");
  const [inscription, setInscription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AskAnswerView | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ model: string; mode: Mode; external: boolean } | null>(null);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, 4 - images.length);
    const urls = await Promise.all(
      picked.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("read failed"));
            r.readAsDataURL(f);
          }),
      ),
    ).catch(() => null);
    if (!urls) {
      toast.error("Those files could not be read.");
      return;
    }
    setImages((prev) => [...prev, ...urls].slice(0, 4));
  };

  const send = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (q.length < 2) {
      toast.error("Type a question first.");
      return;
    }
    if (task === "image" && images.length === 0) {
      toast.error("Attach at least one photograph for image analysis.");
      return;
    }
    if (task === "reading" && inscription.trim().length < 2) {
      toast.error("Enter the inscription characters to research.");
      return;
    }

    setBusy(true);
    setAnswer(null);
    try {
      const res = await ask({
        task,
        mode,
        lang,
        question: q,
        script,
        ...(task === "reading" ? { inscription: inscription.trim() } : {}),
        ...(task === "image" ? { images } : {}),
        ...(projectContext ? { projectContext } : {}),
        ...(history.length ? { history } : {}),
      });
      if (!res.ok || !res.answer) {
        toast.error(res.error ?? "The assistant could not answer.");
        setNotes(res.error ? [res.error] : []);
        return;
      }
      setAnswer(res.answer);
      setSources(res.sources ?? []);
      setNotes(res.notes ?? []);
      setMeta({
        model: res.model ?? "",
        mode: res.mode ?? mode,
        external: Boolean(res.externalSearched),
      });
      setHistory((prev) =>
        [
          ...prev,
          { role: "user" as const, text: q },
          { role: "assistant" as const, text: res.answer!.answer },
        ].slice(-6),
      );
      if (overrideQuestion) setQuestion(overrideQuestion);
    } catch {
      toast.error("The assistant request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="panel p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sparkles className="size-5 text-accent" /> Ask Athar AI
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers are built from retrieved sources: the published-inscription corpus, permitted
          research documents, the uploaded alphabet pack, and — in Detailed Research mode — a live
          search of scholarly publication databases. Published evidence and AI inference are shown
          separately, and unreadable signs stay marked “?”.
        </p>
      </header>

      <div className="panel space-y-4 p-4">
        <div
          role="tablist"
          aria-label="Assistant task"
          className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1"
        >
          {(
            [
              ["question", "Ask a question"],
              ["image", "Analyze inscription"],
              ["reading", "Research this reading"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={task === id}
              onClick={() => setTask(id)}
              className={`min-h-11 rounded-lg px-2 text-xs font-semibold transition ${
                task === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Answer depth</Label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
              {(
                [
                  ["quick", "Quick"],
                  ["detailed", "Detailed"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  aria-pressed={mode === id}
                  className={`min-h-10 rounded-md text-xs font-semibold ${
                    mode === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("ask.answerLanguage")}</Label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLang(l.id)}
                  aria-pressed={lang === l.id}
                  className={`min-h-10 rounded-md text-xs font-semibold ${
                    lang === l.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="ask-script" className="text-xs">
            Script
          </Label>
          <select
            id="ask-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            {SCRIPTS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Script support is experimental and evaluated per script; script identification is kept
            separate from language identification.
          </p>
        </div>

        {task === "reading" && (
          <div>
            <Label htmlFor="ask-inscription" className="text-xs">
              Inscription characters (as typed or transliterated)
            </Label>
            <Input
              id="ask-inscription"
              value={inscription}
              onChange={(e) => setInscription(e.target.value)}
              placeholder="l wdd bn slm"
              className="mt-1"
            />
          </div>
        )}

        {task === "image" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <ImageIcon className="mr-2 size-4" /> Add photograph
              </Button>
              <span className="text-xs text-muted-foreground">{images.length}/4 attached</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void addImages(e.target.files)}
            />
            {images.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <li key={i} className="relative">
                    <img
                      src={src}
                      alt={`Attached photograph ${i + 1}`}
                      className="size-16 rounded-lg object-cover"
                    />
                    <button
                      aria-label={`Remove photograph ${i + 1}`}
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="ask-question" className="text-xs">
            Question
          </Label>
          <Textarea
            id="ask-question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              task === "image"
                ? "What can be read on this rock face, and which script is it?"
                : task === "reading"
                  ? "What do published records support for these words?"
                  : "Which corpora publish Dadanitic inscriptions from al-ʿUlā?"
            }
            className="mt-1"
          />
        </div>

        <Button onClick={() => void send()} disabled={busy} size="lg" className="w-full">
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          {busy ? "Researching…" : mode === "detailed" ? "Detailed Research" : "Quick Answer"}
        </Button>
      </div>

      {notes.length > 0 && !answer && (
        <div className="panel space-y-1 p-4 text-sm text-muted-foreground">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}

      {answer && (
        <div className="space-y-3">
          <article className="panel space-y-3 p-4" dir={langInfo(lang).dir}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.answer}</p>
          </article>

          <Field label="Visible characters" value={answer.visibleCharacters} mono />
          <Field label="Proposed reading" value={answer.proposedReading} mono />
          <Field label="Possible meaning (Arabic)" value={answer.meaningArabic} rtl />
          <Field label="Alternative readings" value={answer.alternatives} />
          <Field label="Missing evidence / what would settle it" value={answer.missingEvidence} />
          <Field label="Supported by the retrieved sources" value={answer.publishedEvidence} />
          <Field label="AI inference (not published evidence)" value={answer.aiInference} />

          {sources.length > 0 && (
            <details className="panel p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Sources ({sources.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {sources.map((s) => (
                  <li key={s.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                    <p className="text-sm font-semibold">
                      {s.title}
                      {answer.usedSourceIds.includes(s.id) && (
                        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
                          cited
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {KIND_LABEL[s.kind]} · {DEPTH_LABEL[s.depth]}
                      {s.authors ? ` · ${s.authors}` : ""}
                      {s.year ? ` · ${s.year}` : ""}
                      {s.page ? ` · page ${s.page}` : ""}
                      {s.license ? ` · ${s.license}` : ""}
                    </p>
                    <p className="mt-1 line-clamp-4 text-xs whitespace-pre-wrap text-muted-foreground">
                      {s.content}
                    </p>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" /> Open source
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {notes.length > 0 && (
            <div className="panel space-y-1 p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Retrieval gaps</p>
              {notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          )}

          {answer.followUps.length > 0 && (
            <div className="panel space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4" /> Follow-up questions
              </p>
              {answer.followUps.map((f, i) => (
                <button
                  key={i}
                  onClick={() => void send(f)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border p-2 text-left text-xs hover:border-primary"
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {meta && (
            <p className="text-xs text-muted-foreground">
              {meta.mode === "detailed" ? "Detailed Research" : "Quick Answer"} · model{" "}
              <code>{meta.model}</code> ·{" "}
              {meta.external
                ? "external scholarly search was queried"
                : "internal sources only (switch to Detailed Research for external search)"}
              . Repeated agreement between AI calls is not expert verification, so no certainty
              score is shown.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  rtl,
}: {
  label: string;
  value: string;
  mono?: boolean;
  rtl?: boolean;
}) {
  if (!value.trim()) return null;
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        dir={rtl ? "rtl" : undefined}
        className={`mt-1 text-sm whitespace-pre-wrap ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
