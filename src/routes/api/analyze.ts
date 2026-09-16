import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireSession } from "@/lib/athar-auth.server";
import { addArabic, reviseWithLexicon, tokenize, wordEvidence } from "@/lib/lexicon.server";
import { findParallels } from "@/lib/reference-search.server";
import {
  REFERENCE_SOURCES,
  SCRIPT_BRIEF,
  readingJsonSchema,
  systemPrompt,
  type ReadingResult,
} from "@/lib/inscription-prompt";

/**
 * Images must be inline data URLs.
 *
 * The value is passed to the provider as `image_url`, so accepting an
 * arbitrary URL would turn this endpoint into a fetch-on-behalf-of primitive
 * pointed at whatever host the caller names. A size ceiling goes with it: the
 * body limit in the handler is the outer bound, this is the per-image one.
 */
const dataUrl = z
  .string()
  .min(32)
  .max(8_000_000)
  .refine((v) => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v), {
    message: "Images must be inline JPEG, PNG or WebP data URLs.",
  });

const Input = z.object({
  originalDataUrl: dataUrl,
  enhancedDataUrl: dataUrl,
  extraDataUrls: z.array(dataUrl).max(3).optional(),
  script: z.enum(["auto", "thamudic", "dadanitic", "nabataean", "other"]),
  lang: z.enum(["ar", "en", "zh", "fr"]),
  userNote: z.string().max(1000).optional(),
  // Output of the on-device prototype matcher, sent only when the user chooses to.
  detectorHint: z
    .object({
      sequence: z.string().max(600),
      modelVersion: z.number().int().nonnegative(),
      accuracy: z.number().nullable(),
      letters: z.number().int().nonnegative(),
    })
    .optional(),
});

const ReadingSchema = z.object({
  script: z.string(),
  direction: z.string(),
  transliteration: z.string(),
  proposedReading: z.string(),
  wordSplit: z.string(),
  meaning: z.string(),
  uncertainties: z.string(),
  alternatives: z.string(),
  unreadable: z.boolean(),
  note: z.string(),
  references: z.array(z.object({ title: z.string(), url: z.string() })),
});

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireSession(request);
        if (!gate.ok) return gate.response;
        const headers = {
          "cache-control": "no-store",
          "set-cookie": gate.setCookie,
        };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

        const { resolveProvider, buildBody, describeFailure, readOutput } =
          await import("@/lib/ai-provider.server");
        const provider = resolveProvider(process.env);
        if (!provider) {
          return json(
            {
              ok: false,
              error:
                "No AI service is configured. Set one of OPENAI_API_KEY, LOVABLE_API_KEY, or ATHAR_AI_BASE_URL together with ATHAR_AI_API_KEY. No simulated reading is produced.",
            },
            503,
          );
        }

        // Five base64 data URLs of full-resolution photographs. Without a cap
        // the handler will buffer whatever is sent and then forward it to a
        // metered provider, so an oversized body is both a memory and a
        // billing problem. 5 images × ~6 MB of base64 is the practical ceiling.
        const MAX_BODY_BYTES = 32 * 1024 * 1024;
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
          return json(
            {
              ok: false,
              error:
                "Those photographs are too large to analyse. Send fewer images, or let the app downscale them first.",
            },
            413,
          );

        const raw = await request.text().catch(() => "");
        if (raw.length > MAX_BODY_BYTES)
          return json(
            {
              ok: false,
              error:
                "Those photographs are too large to analyse. Send fewer images, or let the app downscale them first.",
            },
            413,
          );

        const parsedInput = Input.safeParse(
          ((): unknown => {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          })(),
        );
        if (!parsedInput.success) {
          return json({ ok: false, error: "Invalid analysis request." }, 400);
        }
        const data = parsedInput.data;

        const sources = REFERENCE_SOURCES.map((s) => `- ${s.title}: ${s.url} (${s.note})`).join(
          "\n",
        );

        const images = [data.originalDataUrl, data.enhancedDataUrl, ...(data.extraDataUrls ?? [])];

        const body = buildBody(provider, {
          system: systemPrompt(data.lang),
          text: `Image 1 is the original photograph as captured. Image 2 is a pixel-processed enhancement (RGB decorrelation stretch or CLAHE); its colours are processed/false colour, not real pigment colour. Any further images are additional captures of the same inscription.
${SCRIPT_BRIEF[data.script]}
The only sources you may cite:
${sources}
${data.userNote ? `User note: ${data.userNote}` : ""}
${
  data.detectorHint
    ? `On-device matcher hint (ADVISORY ONLY): a deterministic shape-prototype matcher trained on expert-approved letter examples for this script (model version ${data.detectorHint.modelVersion}, ${data.detectorHint.letters} letters covered, cross-validated accuracy ${
        data.detectorHint.accuracy === null
          ? "unmeasured"
          : `${(data.detectorHint.accuracy * 100).toFixed(1)}%`
      } on approved examples) proposed this sign sequence, with "?" where it abstained: ${data.detectorHint.sequence}
Rules for this hint: it is a hypothesis produced from segmented shapes, NOT a transcription and NOT evidence. Accept a hinted letter only if you can see that letter in the images yourself; drop or replace whatever you cannot see, and never let the hint supply a letter, a word or a length. Never cite the hint as a source, and never raise your certainty because the hint agrees with you.`
    : ""
}
Return the JSON result.`,
          images,
          schemaName: "inscription_reading",
          schema: readingJsonSchema,
        });

        const res = await fetch(provider.url, {
          method: "POST",
          headers: provider.headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("ai provider error", provider.name, res.status, text.slice(0, 400));
          return json(
            { ok: false, error: describeFailure(res.status, provider.name) },
            res.status === 402 ? 402 : 502,
          );
        }

        const out = await readOutput(provider, res);

        if (!out.trim())
          return json(
            {
              ok: false,
              error: "The service returned no reading. Try a sharper photograph or retry.",
            },
            502,
          );

        const parsed = ReadingSchema.safeParse(
          ((): unknown => {
            try {
              return JSON.parse(out);
            } catch {
              return null;
            }
          })(),
        );
        if (!parsed.success)
          return json({ ok: false, error: "The analysis result could not be parsed. Retry." }, 502);

        const reading: ReadingResult = { ...parsed.data, meaningLang: data.lang };

        // Retrieval from the imported reference library. Comparanda only: a
        // similar published inscription is never a verified match, so nothing
        // here changes the reading itself.
        const query = [reading.transliteration, reading.proposedReading]
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .join(" ");
        const { parallels, collection } =
          reading.unreadable || !query
            ? { parallels: [], collection: null }
            : await findParallels(query, data.script).catch((err) => {
                console.error("parallel retrieval failed", err);
                return { parallels: [], collection: null };
              });

        // Documented-lexicon stage: for every word of the reading, retrieve the
        // published records that really contain it, then let a second pass revise
        // the meaning using only that evidence. Letters are never changed here.
        const scriptLabel: Record<string, string | null> = {
          auto: null,
          other: null,
          thamudic: "Thamudic",
          dadanitic: "Dadanitic",
          nabataean: "Nabataean",
        };
        let words: Awaited<ReturnType<typeof wordEvidence>> = [];
        let arabic: "ready" | "setup_required" | "failed" = "ready";
        let lexiconNote = "";
        let citedSigla: string[] = [];
        if (!reading.unreadable && reading.transliteration.trim()) {
          try {
            const tokens = tokenize(`${reading.transliteration} ${reading.wordSplit}`);
            words = await wordEvidence(tokens, scriptLabel[data.script] ?? null);
            if (words.every((w) => w.examples.length === 0) && scriptLabel[data.script])
              words = await wordEvidence(tokens, null);
            const pass = await addArabic(words);
            words = pass.words;
            arabic = pass.arabic;
            const revised = await reviseWithLexicon(reading, words, data.lang);
            if (revised) {
              reading.meaning = revised.meaning;
              reading.uncertainties = revised.uncertainties;
              lexiconNote = revised.lexiconNote;
              citedSigla = revised.citedSigla;
            }
          } catch (err) {
            console.error("lexicon stage failed", err);
          }
        }

        return json({
          ok: true,
          reading,
          parallels,
          referenceCollection: collection,
          words,
          arabic,
          lexiconNote,
          citedSigla,
        });
      },
    },
  },
});
