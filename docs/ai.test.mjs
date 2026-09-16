import { loadTs } from "./_load-ts.mjs";
const { resolveProvider, buildBody, describeFailure } = await loadTs(
  "../src/lib/ai-provider.server.ts",
  import.meta.url,
  ["resolveProvider", "buildBody", "describeFailure"],
);

let bad = 0;
const is = (n, g, w) => {
  const ok = g === w;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}: ${g}${ok ? "" : ` (want ${w})`}`);
};

console.log("— provider resolution —");
is("nothing configured", resolveProvider({}), null);
is("lovable key", resolveProvider({ LOVABLE_API_KEY: "k" }).name, "lovable");
is("lovable uses responses", resolveProvider({ LOVABLE_API_KEY: "k" }).api, "responses");
is(
  "openai key",
  resolveProvider({ OPENAI_API_KEY: "sk-x" }).url,
  "https://api.openai.com/v1/chat/completions",
);
is("openai uses chat", resolveProvider({ OPENAI_API_KEY: "sk-x" }).api, "chat");

// Custom base URL must win over both, so a self-hosted model can override.
const custom = resolveProvider({
  ATHAR_AI_BASE_URL: "http://localhost:11434/v1",
  ATHAR_AI_API_KEY: "ollama",
  OPENAI_API_KEY: "sk-x",
  LOVABLE_API_KEY: "k",
});
is("custom wins", custom.url, "http://localhost:11434/v1/chat/completions");
is(
  "trailing slash trimmed",
  resolveProvider({ ATHAR_AI_BASE_URL: "https://x.ai/v1///", ATHAR_AI_API_KEY: "k" }).url,
  "https://x.ai/v1/chat/completions",
);
is("base url without key ignored", resolveProvider({ ATHAR_AI_BASE_URL: "http://x/v1" }), null);
is(
  "openai over lovable",
  resolveProvider({ OPENAI_API_KEY: "a", LOVABLE_API_KEY: "b" }).name,
  "openai-compatible",
);
is(
  "model override",
  resolveProvider({ OPENAI_API_KEY: "a", ATHAR_AI_MODEL: "gpt-4o-mini" }).model,
  "gpt-4o-mini",
);
is(
  "bearer header",
  resolveProvider({ OPENAI_API_KEY: "sk-9" }).headers.Authorization,
  "Bearer sk-9",
);
is("lovable header", resolveProvider({ LOVABLE_API_KEY: "L" }).headers["Lovable-API-Key"], "L");

console.log("— request bodies —");
const req = {
  system: "You read inscriptions.",
  text: "Read this.",
  images: ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"],
  schemaName: "inscription_reading",
  schema: { type: "object" },
};

const rb = buildBody(resolveProvider({ LOVABLE_API_KEY: "k" }), req);
is("responses streams", rb.stream, true);
is("responses has input", Array.isArray(rb.input), true);
is("responses image part", rb.input[1].content[1].type, "input_image");
is("responses image count", rb.input[1].content.length, 3);
is("responses schema location", rb.text.format.name, "inscription_reading");
is("responses strict", rb.text.format.strict, true);

const cb = buildBody(resolveProvider({ OPENAI_API_KEY: "k" }), req);
is("chat has messages", Array.isArray(cb.messages), true);
is("chat system first", cb.messages[0].role, "system");
is("chat image part", cb.messages[1].content[1].type, "image_url");
is("chat image nested url", cb.messages[1].content[1].image_url.url, "data:image/jpeg;base64,AAA");
is("chat schema location", cb.response_format.json_schema.name, "inscription_reading");
is("chat low temperature", cb.temperature, 0.2);
is("chat does not stream", cb.stream, undefined);

// Both shapes must serialise — a nested undefined would break the POST.
JSON.parse(JSON.stringify(rb));
JSON.parse(JSON.stringify(cb));
console.log("PASS  both bodies serialise");

console.log("— error messages —");
is("401 names the key", describeFailure(401, "openai-compatible").includes("key"), true);
is(
  "404 names the model",
  describeFailure(404, "openai-compatible").includes("ATHAR_AI_MODEL"),
  true,
);
is("402 lovable mentions credits", describeFailure(402, "lovable").includes("Lovable"), true);
is("402 other does not", describeFailure(402, "openai-compatible").includes("Lovable"), false);
is("429 is retryable", describeFailure(429, "lovable").includes("Retry"), true);
is("503 is retryable", describeFailure(503, "lovable").includes("Retry"), true);

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad ? 1 : 0);
