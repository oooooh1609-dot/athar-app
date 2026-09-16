/**
 * Which AI service the reading endpoint talks to.
 *
 * The app was wired to one gateway with one key name, which meant it only
 * worked inside Lovable. Anyone running it on their own machine, or moving it
 * to their own hosting, had no AI at all — and the failure looked like a bug
 * rather than a missing account.
 *
 * Three ways to configure it, checked in this order:
 *
 *  1. `ATHAR_AI_BASE_URL` + `ATHAR_AI_API_KEY` — any OpenAI-compatible
 *     service: OpenAI itself, OpenRouter, Groq, Together, or a local Ollama
 *     on `http://localhost:11434/v1`.
 *  2. `OPENAI_API_KEY` — OpenAI directly, no other settings needed.
 *  3. `LOVABLE_API_KEY` — the original gateway, still the default inside
 *     Lovable.
 *
 * Vision is required either way: the model is shown photographs, so a
 * text-only model will fail no matter which provider serves it.
 */

export type Provider = {
  name: "lovable" | "openai-compatible";
  url: string;
  headers: Record<string, string>;
  model: string;
  /** Responses API (`/v1/responses`) streams; chat completions does not. */
  api: "responses" | "chat";
};

/** Reads the environment. Returns null when nothing is configured. */
export function resolveProvider(env: Record<string, string | undefined>): Provider | null {
  const model = env["ATHAR_AI_MODEL"];

  const customUrl = env["ATHAR_AI_BASE_URL"];
  const customKey = env["ATHAR_AI_API_KEY"];
  if (customUrl && customKey && customKey !== "disabled")
    return {
      name: "openai-compatible",
      url: `${customUrl.replace(/\/+$/, "")}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${customKey}` },
      model: model || "gpt-4o",
      api: "chat",
    };

  const openai = env["OPENAI_API_KEY"];
  if (openai && openai !== "disabled")
    return {
      name: "openai-compatible",
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
      model: model || "gpt-4o",
      api: "chat",
    };

  const gemini = env["GEMINI_API_KEY"];
  if (gemini && gemini !== "disabled")
    return {
      name: "openai-compatible",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gemini}` },
      model: model || "gemini-2.5-flash",
      api: "chat",
    };

  const lovable = env["LOVABLE_API_KEY"];
  if (lovable && lovable !== "disabled")
    return {
      name: "lovable",
      url: "https://ai.gateway.lovable.dev/v1/responses",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovable,
        "X-Lovable-AIG-SDK": "fetch",
      },
      model: model || "openai/gpt-5",
      api: "responses",
    };

  return null;
}

export type VisionRequest = {
  system: string;
  text: string;
  /** Inline data URLs. */
  images: string[];
  schemaName: string;
  schema: unknown;
  /** Low temperature: this is a reading task, not a writing one. */
  temperature?: number;
};

/**
 * Builds the request body for whichever API shape the provider speaks.
 *
 * The two differ in more than naming: the Responses API nests content under
 * `input` with `input_text` / `input_image` parts, while chat completions
 * uses `messages` with `text` / `image_url` parts, and puts the JSON schema
 * in `response_format` rather than `text.format`.
 */
export function buildBody(provider: Provider, req: VisionRequest): unknown {
  if (provider.api === "responses")
    return {
      model: provider.model,
      stream: true,
      input: [
        { role: "system", content: [{ type: "input_text", text: req.system }] },
        {
          role: "user",
          content: [
            { type: "input_text", text: req.text },
            ...req.images.map((url) => ({ type: "input_image", image_url: url })),
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: req.schemaName, strict: true, schema: req.schema },
      },
    };

  return {
    model: provider.model,
    temperature: req.temperature ?? 0.2,
    messages: [
      { role: "system", content: req.system },
      {
        role: "user",
        content: [
          { type: "text", text: req.text },
          ...req.images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.schema },
    },
  };
}

/** Turns a provider HTTP status into something worth showing a user. */
export function describeFailure(status: number, providerName: string): string {
  if (status === 401 || status === 403)
    return `The AI service rejected the key (${status}). Check the API key in your environment.`;
  if (status === 402)
    return providerName === "lovable"
      ? "The analysis service is out of credits. Add credits in Lovable settings."
      : "The AI account has no remaining credit.";
  if (status === 404)
    return "The configured model was not found. Check ATHAR_AI_MODEL against your provider's model list.";
  if (status === 429) return "The analysis service is busy. Retry in a moment.";
  if (status >= 500) return "Temporary analysis service failure. Retry.";
  return "The analysis could not be completed.";
}

/**
 * Reads the whole model output, whichever transport it arrives by.
 *
 * Streaming exists here to avoid an idle-timeout on slow vision calls behind
 * some proxies, not to show tokens as they arrive — the endpoint returns one
 * JSON object at the end either way.
 */
export async function readOutput(provider: Provider, res: Response): Promise<string> {
  if (provider.api === "chat") {
    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    return data?.choices?.[0]?.message?.content ?? "";
  }

  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buf = "";
  let out = "";
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
          response?: { output_text?: string };
        };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.completed" && !out) out = ev.response?.output_text ?? "";
      } catch {
        /* a partial SSE line; the next chunk completes it */
      }
    }
  }
  return out;
}
