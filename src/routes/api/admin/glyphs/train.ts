/**
 * Administrator training controls: train a new candidate model version from the
 * approved examples, inspect the stored versions and their measured scores, and
 * activate or retire a version. Activation is refused unless the measured scores
 * clear the published thresholds.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import { SCRIPTS } from "@/lib/glyph-dataset.server";
import { activateVersion, listModels, retireActive, trainScript } from "@/lib/glyph-train.server";

const Script = z.enum(SCRIPTS);

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), script: Script }),
  z.object({
    action: z.literal("train"),
    script: Script,
    provenance: z.string().trim().max(400).optional(),
  }),
  z.object({ action: z.literal("activate"), script: Script, version: z.number().int().positive() }),
  z.object({ action: z.literal("retire"), script: Script }),
]);

export const Route = createFileRoute("/api/admin/glyphs/train")({
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
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
        const body = parsed.data;

        try {
          if (body.action === "list")
            return Response.json({ ok: true, versions: await listModels(body.script) });

          if (body.action === "train") {
            const out = await trainScript(body.script, body.provenance);
            return Response.json(out, { status: out.ok ? 200 : 409 });
          }

          if (body.action === "activate") {
            const out = await activateVersion(body.script, body.version);
            return Response.json(out, { status: out.ok ? 200 : 409 });
          }

          return Response.json(await retireActive(body.script));
        } catch (err) {
          console.error("glyph training failed", err);
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "Training failed." },
            { status: 502 },
          );
        }
      },
    },
  },
});
