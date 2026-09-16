import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { audit, requireAdminRequest } from "@/lib/access.server";

/**
 * Administrator-only extension management. Authorisation is enforced here on
 * the server for every action — the menu being hidden is never the control.
 * Imported code is stored for review and is never executed on the server.
 */

const Body = z.union([
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("logs"), limit: z.number().int().min(1).max(200).optional() }),
  z.object({
    action: z.literal("import"),
    manifest: z.unknown(),
    moduleSource: z.string().max(400000).optional(),
    secretName: z.string().max(80).optional(),
  }),
  z.object({
    action: z.literal("register-source"),
    name: z.string().min(2).max(120),
    sourceUrl: z.string().url().max(400),
    purpose: z.string().min(4).max(1000),
    runtime: z.enum(["browser", "backend", "external_worker"]),
    license: z.string().min(2).max(200),
    requirements: z.string().max(1000).optional(),
    endpoint: z.string().max(400).optional(),
    needsPaidService: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("record-test"),
    id: z.string().uuid(),
    passed: z.boolean(),
    note: z.string().min(1).max(2000),
    durationMs: z.number().int().min(0).max(600000).optional(),
  }),
  z.object({ action: z.literal("enable"), id: z.string().uuid() }),
  z.object({ action: z.literal("disable"), id: z.string().uuid() }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    manifest: z.unknown(),
    moduleSource: z.string().max(400000).optional(),
  }),
  z.object({ action: z.literal("rollback"), id: z.string().uuid() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
  z.object({
    action: z.literal("log"),
    id: z.string().uuid(),
    event: z.string().min(2).max(60),
    detail: z.string().max(4000).optional(),
    surface: z.string().max(40).optional(),
    durationMs: z.number().int().min(0).max(3600000).optional(),
    version: z.string().max(40),
  }),
]);

export const Route = createFileRoute("/api/admin/extensions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdminRequest(request);
        if (!gate.ok) return gate.response;
        const headers = { "cache-control": "no-store" };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: "Invalid request." }, 400);
        const data = parsed.data;
        const ext = await import("@/lib/extensions.server");

        switch (data.action) {
          case "list": {
            const res = await ext.listExtensions();
            return json({ ok: true, ...res });
          }
          case "logs":
            return json({ ok: true, runs: await ext.listRuns(data.limit ?? 60) });
          case "import": {
            const res = await ext.importExtension({
              manifest: data.manifest,
              ...(data.moduleSource ? { moduleSource: data.moduleSource } : {}),
              ...(data.secretName ? { secretName: data.secretName } : {}),
            });
            if (res.ok) await audit({ action: "extension_imported", detail: res.extension.slug });
            return json(res, res.ok ? 200 : 400);
          }
          case "register-source": {
            const res = await ext.registerSource({
              name: data.name,
              sourceUrl: data.sourceUrl,
              purpose: data.purpose,
              runtime: data.runtime,
              license: data.license,
              ...(data.requirements ? { requirements: data.requirements } : {}),
              ...(data.endpoint ? { endpoint: data.endpoint } : {}),
              ...(data.needsPaidService === undefined
                ? {}
                : { needsPaidService: data.needsPaidService }),
            });
            if (res.ok)
              await audit({ action: "extension_source_registered", detail: data.sourceUrl });
            return json(res, res.ok ? 200 : 400);
          }
          case "record-test": {
            const res = await ext.recordTest({
              id: data.id,
              passed: data.passed,
              note: data.note,
              ...(data.durationMs === undefined ? {} : { durationMs: data.durationMs }),
            });
            return json(res, res.ok ? 200 : 400);
          }
          case "enable":
          case "disable": {
            const res = await ext.setStatus(
              data.id,
              data.action === "enable" ? "enabled" : "disabled",
            );
            if (res.ok) await audit({ action: `extension_${data.action}d`, detail: data.id });
            return json(res, res.ok ? 200 : 400);
          }
          case "update": {
            const res = await ext.updateExtension({
              id: data.id,
              manifest: data.manifest,
              ...(data.moduleSource ? { moduleSource: data.moduleSource } : {}),
            });
            return json(res, res.ok ? 200 : 400);
          }
          case "rollback": {
            const res = await ext.rollbackExtension(data.id);
            return json(res, res.ok ? 200 : 400);
          }
          case "remove": {
            const res = await ext.removeExtension(data.id);
            if (res.ok) await audit({ action: "extension_removed", detail: data.id });
            return json(res, res.ok ? 200 : 400);
          }
          case "log": {
            await ext.logRun({
              extensionId: data.id,
              version: data.version,
              event: data.event,
              ...(data.detail ? { detail: data.detail } : {}),
              ...(data.surface ? { surface: data.surface } : {}),
              ...(data.durationMs === undefined ? {} : { durationMs: data.durationMs }),
            });
            return json({ ok: true });
          }
        }
      },
    },
  },
});
