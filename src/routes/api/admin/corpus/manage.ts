/**
 * Administrator management of the documented-photograph corpus: adding an openly
 * licensed photograph, removing one, and storing the letters labelled on it.
 *
 * Named letters become approved training examples with the photograph's licence
 * and source recorded; signs marked unknown are stored as unknown and excluded
 * from training.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import {
  addCorpusImage,
  deleteCorpusImage,
  listCorpus,
  saveCorpusLabels,
} from "@/lib/corpus.server";
import { SCRIPTS } from "@/lib/glyph-dataset.server";

const Sign = z.object({
  letter: z.string().trim().max(40),
  transliteration: z.string().trim().max(40).optional(),
  features: z.array(z.number()).min(8).max(512),
  bbox: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  unknown: z.boolean(),
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), script: z.enum(SCRIPTS).optional() }),
  z.object({
    action: z.literal("add"),
    title: z.string().trim().min(2).max(200),
    siglum: z.string().trim().max(80).optional(),
    script: z.enum(SCRIPTS),
    imageUrl: z.string().url().max(1000),
    sourceUrl: z.string().url().max(1000).optional(),
    license: z.string().trim().min(2).max(200),
    credit: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(600).optional(),
  }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({
    action: z.literal("label"),
    id: z.string().uuid(),
    signs: z.array(Sign).min(1).max(200),
  }),
]);

export const Route = createFileRoute("/api/admin/corpus/manage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireAdmin(request)))
          return Response.json(
            { ok: false, error: "Administrator sign-in required." },
            { status: 401 },
          );

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json(
            { ok: false, error: "Invalid request.", detail: parsed.error.issues[0]?.message },
            { status: 400 },
          );
        const body = parsed.data;

        try {
          if (body.action === "list")
            return Response.json({ ok: true, images: await listCorpus(body.script) });

          if (body.action === "add") {
            const out = await addCorpusImage(body);
            return Response.json(out, { status: out.ok ? 200 : 409 });
          }

          if (body.action === "delete") return Response.json(await deleteCorpusImage(body.id));

          const named = body.signs.filter((s) => !s.unknown);
          if (named.some((s) => !s.letter))
            return Response.json(
              { ok: false, error: "Every named sign needs a letter, or mark it unknown." },
              { status: 400 },
            );
          const out = await saveCorpusLabels(body.id, body.signs);
          return Response.json(out, { status: out.ok ? 200 : 409 });
        } catch (err) {
          console.error("corpus management failed", err);
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "Request failed." },
            { status: 502 },
          );
        }
      },
    },
  },
});
