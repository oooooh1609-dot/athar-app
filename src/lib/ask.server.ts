/**
 * "Ask Athar AI" — a research-grounded assistant.
 *
 * Every answer is produced by a real Lovable AI Gateway call on the Responses
 * API, after real retrieval (see research.server.ts). The model is instructed to
 * separate what retrieved sources support from its own inference, to mark
 * unreadable signs with "?", and never to invent a reference, a DOI, a page
 * number or access to a restricted paper. No confidence percentage is produced.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { retrieveEvidence, type Evidence } from "@/lib/research.server";

export type AskMode = "quick" | "detailed";
export type AskTask = "question" | "image" | "reading";

export type AiSettings = {
  quickModel: string;
  detailedModel: string;
  monthlyCallLimit: number;
  enabled: boolean;
};

const DEFAULTS: AiSettings = {
  quickModel: "openai/gpt-5.6-luna",
  detailedModel: "openai/gpt-6-astra",
  monthlyCallLimit: 500,
  enabled: true,
};

export async function aiSettings(): Promise<AiSettings> {
  const { data, error } = await supabaseAdmin
    .from("ai_settings")
    .select("quick_model, detailed_model, monthly_call_limit, enabled")
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return {
    quickModel: data.quick_model,
    detailedModel: data.detailed_model,
    monthlyCallLimit: data.monthly_call_limit,
    enabled: data.enabled,
  };
}

export async function usageThisMonth() {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

async function logUsage(row: {
  mode: string;
  model: string;
  hadImage: boolean;
  status: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}) {
  const { error } = await supabaseAdmin.from("ai_usage").insert({
    mode: row.mode,
    model: row.model,
    had_image: row.hadImage,
    status: row.status,
    input_tokens: row.inputTokens ?? null,
    output_tokens: row.outputTokens ?? null,
  });
  if (error) console.error("usage logging failed", error.message);
}

/* --------------------------------- prompt -------------------------------- */

const answerSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "visibleCharacters",
    "proposedReading",
    "meaningArabic",
    "alternatives",
    "missingEvidence",
    "publishedEvidence",
    "aiInference",
    "usedSourceIds",
    "followUps",
  ],
  properties: {
    answer: { type: "string" },
    visibleCharacters: { type: "string" },
    proposedReading: { type: "string" },
    meaningArabic: { type: "string" },
    alternatives: { type: "string" },
    missingEvidence: { type: "string" },
    publishedEvidence: { type: "string" },
    aiInference: { type: "string" },
    usedSourceIds: { type: "array", items: { type: "string" } },
    followUps: { type: "array", items: { type: "string" } },
  },
} as const;

export type AskAnswer = {
  answer: string;
  visibleCharacters: string;
  proposedReading: string;
  meaningArabic: string;
  alternatives: string;
  missingEvidence: string;
  publishedEvidence: string;
  aiInference: string;
  usedSourceIds: string[];
  followUps: string[];
};

function systemPrompt(task: AskTask, lang: "ar" | "en" | "zh" | "fr", mode: AskMode) {
  const answerLang =
    {
      ar: "Write every explanation in Modern Standard Arabic.",
      en: "Write every explanation in English.",
      zh: "Write every explanation in Simplified Chinese.",
      fr: "Write every explanation in French.",
    }[lang] ?? "Write every explanation in English.";
  return [
    "You are a research assistant for archaeology and ancient Arabian epigraphy (Thamudic classifications, Dadanitic/Lihyanite, Nabataean, Old South Arabian/Musnad).",
    `${answerLang} Keep transliterations, sigla and bibliographic titles in their original published Latin form.`,

    "Absolute rules:",
    "- Use only the numbered sources given in the request. Never invent a reference, author, DOI, page number, quotation, or claim access to a paywalled text.",
    "- Say plainly when a source gave only bibliographic metadata or an abstract, rather than treating it as full-text evidence.",
    "- Keep script identification separate from language identification.",
    "- Mark every sign you cannot read with '?' — one '?' per unreadable sign. Keep any restoration separate and label it as a proposal, not a reading.",
    "- Never complete a damaged letter by imagining it, and never produce a confidence percentage or a numeric certainty.",
    "- The alphabet pack is reference imagery and row metadata, not a trained recognition model; if it supplies no value for a shape, report the shape as unidentified.",
    "- If the evidence is insufficient, return the supported partial result and state exactly which additional evidence would settle it (e.g. a raking-light photograph of a specific area, a squeeze, a published edition).",
    task === "image"
      ? "For a photograph: first judge image quality; then propose script and possible reading direction; then list visible characters and uncertain areas; then a scholarly transliteration only where the strokes support it; then compare with the retrieved parallels and references; then propose word segmentation and possible meanings; finally check the proposal against both the visible strokes and the retrieved evidence."
      : "",
    task === "reading"
      ? "For a typed inscription: treat the characters as given by the user, and research what published records and literature actually support for those forms and words."
      : "",
    mode === "quick"
      ? "Quick Answer mode: be brief and concrete. Do not pad."
      : "Detailed Research mode: be thorough and explicit about method and gaps.",
    "Fill fields that do not apply with an empty string. 'meaningArabic' is always Arabic. 'publishedEvidence' states only what the sources support; 'aiInference' states only your own reasoning beyond them.",
    "Propose up to 3 follow-up questions the user could ask next.",
  ]
    .filter(Boolean)
    .join("\n");
}

function sourcesBlock(evidence: Evidence[]) {
  if (evidence.length === 0) return "No sources were retrieved.";
  return evidence
    .map((e) => {
      const depth =
        e.depth === "page_text"
          ? "retrieved page text"
          : e.depth === "abstract"
            ? "abstract only"
            : e.depth === "metadata_only"
              ? "bibliographic metadata only"
              : "database record";
      return [
        `[${e.id}] (${e.kind}, ${depth}) ${e.title}`,
        e.authors ? `author: ${e.authors}` : "",
        e.year ? `year: ${e.year}` : "",
        e.page ? `page: ${e.page}` : "",
        e.url ? `url: ${e.url}` : "url: none",
        e.license ? `source/licence: ${e.license}` : "",
        e.content,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/* ------------------------------ gateway call ------------------------------ */

type GatewayResult =
  | {
      ok: true;
      text: string;
      usage: { input?: number | undefined; output?: number | undefined };
    }
  | { ok: false; status: number; error: string };

async function callGateway(
  apiKey: string,
  model: string,
  input: unknown,
  reasoning: boolean,
): Promise<GatewayResult> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
      stream: true,
      ...(reasoning ? { reasoning: { effort: "medium" } } : {}),
      input,
      text: {
        format: {
          type: "json_schema",
          name: "athar_research_answer",
          strict: true,
          schema: answerSchema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("gateway error", res.status, body.slice(0, 400));
    const error =
      res.status === 402
        ? "The AI service is out of credits. The project owner can add credits in Lovable settings."
        : res.status === 403
          ? "The AI service is disabled for this workspace by policy."
          : res.status === 429
            ? "The AI service is rate limited right now. Try again in a moment."
            : res.status >= 500
              ? "Temporary AI service failure. Try again."
              : "The AI request was rejected. Nothing was generated.";
    return { ok: false, status: res.status, error };
  }

  const reader = res.body?.getReader();
  if (!reader) return { ok: false, status: 502, error: "Unexpected provider response." };
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
  const usage: { input?: number | undefined; output?: number | undefined } = {};
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: {
            output_text?: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
        };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.completed") {
          if (!out) out = ev.response?.output_text ?? "";
          usage.input = ev.response?.usage?.input_tokens;
          usage.output = ev.response?.usage?.output_tokens;
        }
      } catch {
        /* partial SSE line */
      }
    }
  }
  if (!out.trim()) return { ok: false, status: 502, error: "The AI service returned no answer." };
  return { ok: true, text: out, usage };
}

/* ------------------------------- public API ------------------------------ */

export type AskInput = {
  task: AskTask;
  mode: AskMode;
  lang: "ar" | "en" | "zh" | "fr";
  question: string;
  script: string;
  inscription?: string | undefined;
  images?: string[] | undefined;
  projectContext?: string | undefined;
  history?: { role: "user" | "assistant"; text: string }[] | undefined;
};

export type AskOutput =
  | {
      ok: true;
      answer: AskAnswer;
      sources: Evidence[];
      notes: string[];
      model: string;
      mode: AskMode;
      externalSearched: boolean;
    }
  | { ok: false; error: string; status: number };

export async function askAthar(input: AskInput): Promise<AskOutput> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey)
    return {
      ok: false,
      status: 503,
      error:
        "The AI provider is not configured on the server (LOVABLE_API_KEY is missing). No simulated answer is produced.",
    };

  const settings = await aiSettings();
  if (!settings.enabled)
    return {
      ok: false,
      status: 503,
      error: "The assistant is switched off in administrator settings.",
    };

  const used = await usageThisMonth();
  if (settings.monthlyCallLimit > 0 && used >= settings.monthlyCallLimit)
    return {
      ok: false,
      status: 429,
      error: `The monthly assistant call limit (${settings.monthlyCallLimit}) has been reached. An administrator can raise it in settings.`,
    };

  const retrievalQuery = [input.inscription ?? "", input.question]
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  const { evidence, notes, externalSearched } = await retrieveEvidence({
    query: retrievalQuery,
    ...(/[\u0600-\u06FF]/.test(input.question)
      ? { arabicQuery: input.question.slice(0, 200) }
      : {}),
    script: input.script,
    external: input.mode === "detailed",
  });

  const model = input.mode === "detailed" ? settings.detailedModel : settings.quickModel;
  const reasoning = model.startsWith("openai/gpt-6") || input.mode === "detailed";

  const parts: unknown[] = [
    {
      type: "input_text",
      text: [
        input.projectContext ? `Current project context: ${input.projectContext}` : "",
        input.inscription ? `Inscription entered by the user (as typed): ${input.inscription}` : "",
        input.images?.length
          ? `${input.images.length} photograph(s) follow. The first is the original capture; any others are processed enhancements (false colour) or additional viewpoints.`
          : "",
        `Script setting: ${input.script}`,
        "Retrieved sources you may use:",
        sourcesBlock(evidence),
        notes.length ? `Retrieval gaps: ${notes.join(" ")}` : "",
        ...(input.history ?? [])
          .slice(-6)
          .map(
            (h) =>
              `${h.role === "user" ? "Earlier question" : "Earlier answer"}: ${h.text.slice(0, 600)}`,
          ),
        `Question: ${input.question}`,
        "Return the JSON result.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...(input.images ?? []).map((url) => ({ type: "input_image", image_url: url })),
  ];

  const result = await callGateway(
    apiKey,
    model,
    [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt(input.task, input.lang, input.mode) }],
      },
      { role: "user", content: parts },
    ],
    reasoning,
  );

  if (!result.ok) {
    await logUsage({
      mode: input.mode,
      model,
      hadImage: Boolean(input.images?.length),
      status: `error_${result.status}`,
    });
    return { ok: false, error: result.error, status: result.status === 402 ? 402 : 502 };
  }

  let answer: AskAnswer | null = null;
  try {
    const raw = JSON.parse(result.text) as Partial<AskAnswer>;
    answer = {
      answer: String(raw.answer ?? ""),
      visibleCharacters: String(raw.visibleCharacters ?? ""),
      proposedReading: String(raw.proposedReading ?? ""),
      meaningArabic: String(raw.meaningArabic ?? ""),
      alternatives: String(raw.alternatives ?? ""),
      missingEvidence: String(raw.missingEvidence ?? ""),
      publishedEvidence: String(raw.publishedEvidence ?? ""),
      aiInference: String(raw.aiInference ?? ""),
      usedSourceIds: Array.isArray(raw.usedSourceIds) ? raw.usedSourceIds.map(String) : [],
      followUps: Array.isArray(raw.followUps) ? raw.followUps.map(String).slice(0, 3) : [],
    };
  } catch {
    answer = null;
  }

  await logUsage({
    mode: input.mode,
    model,
    hadImage: Boolean(input.images?.length),
    status: answer ? "ok" : "unparsed",
    inputTokens: result.usage.input ?? null,
    outputTokens: result.usage.output ?? null,
  });

  if (!answer)
    return { ok: false, status: 502, error: "The AI answer could not be read. Try again." };

  const cited = new Set(answer.usedSourceIds);
  const sources = evidence.filter(
    (e) => cited.has(e.id) || e.kind === "document" || e.kind === "corpus",
  );

  return { ok: true, answer, sources, notes, model, mode: input.mode, externalSearched };
}
