/**
 * "Search Meaning" for a composed inscription.
 *
 * Only documented records are consulted: the imported published-inscription
 * corpus. No dictionary is connected, so a match here is a similar published
 * inscription with its own editors' translation — never a word-by-word
 * translation of the user's text.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { addArabic, tokenize, wordEvidence } from "@/lib/lexicon.server";
import { findParallels } from "@/lib/reference-search.server";
import { requireApproved } from "@/lib/access.server";

const SCRIPT_LABEL: Record<string, string | null> = {
  auto: null,
  other: null,
  thamudic: "Thamudic",
  dadanitic: "Dadanitic",
  nabataean: "Nabataean",
};

const Body = z.object({
  transliteration: z.string().max(400),
  script: z.enum(["thamudic", "dadanitic", "nabataean", "other", "auto"]).default("auto"),
  /** Interface language for the glosses; the published English text is kept. */
  lang: z.enum(["ar", "en", "zh", "fr"]).default("ar"),
});

export const Route = createFileRoute("/api/references/lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const q = parsed.data.transliteration.replace(/[?]/g, " ").trim();
        if (q.replace(/\s+/g, "").length < 2)
          return Response.json({
            ok: true,
            state: "no_transliteration",
            message:
              "No transliteration is available for these signs, so there is nothing to look up. Reviewed letter values are required first.",
          });

        const { parallels, collection } = await findParallels(q, parsed.data.script, 8);

        if (!collection || collection.records === 0)
          return Response.json({
            ok: true,
            state: "reference_required",
            message:
              "Reference data required: no published-inscription corpus is loaded in this app yet.",
          });

        const tokens = tokenize(q);
        let words = await wordEvidence(tokens, SCRIPT_LABEL[parsed.data.script] ?? null);
        // Records for a word may exist in another script of the same corpus.
        if (words.every((w) => w.examples.length === 0) && SCRIPT_LABEL[parsed.data.script])
          words = await wordEvidence(tokens, null);
        const arabicPass = await addArabic(words, parsed.data.lang);

        return Response.json({
          ok: true,
          state:
            parallels.length || arabicPass.words.some((w) => w.examples.length)
              ? "matches"
              : "no_match",
          message: parallels.length ? undefined : "No documented match found in the loaded corpus.",
          collection,
          parallels,
          words: arabicPass.words,
          arabic: arabicPass.arabic,
          dictionary: false,
        });
      },
    },
  },
});
