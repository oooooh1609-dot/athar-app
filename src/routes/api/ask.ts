import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { askAthar } from "@/lib/ask.server";
import { requireSession } from "@/lib/athar-auth.server";

const Body = z.object({
  task: z.enum(["question", "image", "reading"]),
  mode: z.enum(["quick", "detailed"]),
  lang: z.enum(["ar", "en", "zh", "fr"]),
  question: z.string().min(2).max(2000),
  script: z.enum(["auto", "thamudic", "dadanitic", "nabataean", "musnad", "other"]).default("auto"),
  inscription: z.string().max(600).optional(),
  images: z.array(z.string().min(32)).max(4).optional(),
  projectContext: z.string().max(600).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(8)
    .optional(),
});

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireSession(request);
        if (!gate.ok) return gate.response;
        const headers = { "cache-control": "no-store", "set-cookie": gate.setCookie };

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400, headers });

        const result = await askAthar(parsed.data);
        if (!result.ok)
          return Response.json(
            { ok: false, error: result.error },
            { status: result.status, headers },
          );
        return Response.json(result, { headers });
      },
    },
  },
});
