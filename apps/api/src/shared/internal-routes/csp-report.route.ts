import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import { emitEvent } from "../event-emitter";
import { logger } from "../logger";
import { resolveClientIp } from "../middleware/rate-limit.ip";
import type { IOutboxRepository } from "../ports/outbox.port";

const BODY_LIMIT_BYTES = 64 * 1024;

// Legacy application/csp-report — all fields are pre-truncated in the handler,
// so the schema uses generous max lengths to accept any syntactically valid report.
const LegacyCspReportBodySchema = z.object({
  "document-uri": z.string(),
  "blocked-uri": z.string(),
  "violated-directive": z.string(),
  "effective-directive": z.string(),
  disposition: z.enum(["enforce", "report"]).optional().default("enforce"),
  "source-file": z.string().optional(),
  "script-sample": z.string().optional(),
  "line-number": z.coerce.number().int().min(0).optional(),
  "column-number": z.coerce.number().int().min(0).optional(),
});

const LegacyCspReportSchema = z.object({
  "csp-report": LegacyCspReportBodySchema,
});

// application/reports+json — items may be of any type; we only care about csp-violation.
// body is loosely typed so unknown report types with missing csp fields don't fail validation.
const ReportItemSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  body: z
    .object({
      documentURL: z.string().optional(),
      blockedURL: z.string().optional(),
      effectiveDirective: z.string().optional(),
      disposition: z.enum(["enforce", "report"]).optional().default("enforce"),
      sourceFile: z.string().optional(),
      sample: z.string().optional(),
      lineNumber: z.coerce.number().int().min(0).optional(),
      columnNumber: z.coerce.number().int().min(0).optional(),
    })
    .optional(),
});

const ReportsJsonSchema = z.array(ReportItemSchema);

export interface CspReportDeps {
  outbox: IOutboxRepository;
  appUrl?: string;
}

function isFromOurApp(documentUri: string, appUrl: string | undefined): boolean {
  if (!appUrl) return true;
  try {
    return new URL(documentUri).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

// Permissive CORS: browsers send reports with Origin: null (sandboxed iframes)
// and application/reports+json triggers a preflight (non-simple content-type).
// Credentials are not relevant for report-only endpoints. Exported so index.ts
// can register it BEFORE the global restrictive cors — hono/cors terminates
// OPTIONS, so whichever cors sees the preflight first wins.
export const cspReportCors = cors({
  origin: "*",
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  credentials: false,
});

export function makeCspReportApp(deps: CspReportDeps) {
  const app = new Hono();

  app.use("/csp-report", cspReportCors);
  // Browsers post report-uri/report-to cross-origin; without this the API's same-origin CORP
  // makes Chrome drop the response (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) and the report is lost.
  app.use("/csp-report", async (c, next) => {
    await next();
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
  });

  app.post(
    "/csp-report",
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
    }),
    async (c) => {
      const contentType = c.req.header("Content-Type") ?? "";
      let rawText: string;
      try {
        rawText = await c.req.text();
      } catch {
        return c.body(null, 400);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return c.body(null, 400);
      }

      const ip = resolveClientIp(c).slice(0, 45);

      if (contentType.includes("application/reports+json")) {
        if (!Array.isArray(parsed)) {
          return c.body(null, 400);
        }

        const result = ReportsJsonSchema.safeParse(parsed);
        if (!result.success) {
          return c.body(null, 400);
        }

        const violations = result.data.filter((r) => r.type === "csp-violation" && r.body);
        const violation = violations[0];
        if (!violation?.body) {
          return c.body(null, 204);
        }
        if (violations.length > 1) {
          logger.debug(
            { ignored: violations.length - 1 },
            "csp-report batch: emitting first violation only",
          );
        }

        const body = violation.body;
        const documentUri = (body.documentURL ?? "").slice(0, 2048);
        if (!isFromOurApp(documentUri, deps.appUrl)) {
          return c.body(null, 204);
        }
        const blockedUri = (body.blockedURL ?? "").slice(0, 2048);
        const effectiveDirective = (body.effectiveDirective ?? "").slice(0, 64);

        await emitCspEvent(deps.outbox, ip, {
          documentUri,
          blockedUri,
          violatedDirective: effectiveDirective.slice(0, 128),
          effectiveDirective,
          disposition: body.disposition ?? "enforce",
          sourceFile: body.sourceFile?.slice(0, 2048),
          sample: body.sample?.slice(0, 100),
          lineNumber: body.lineNumber,
          columnNumber: body.columnNumber,
        });

        return c.body(null, 204);
      }

      // Legacy application/csp-report
      const result = LegacyCspReportSchema.safeParse(parsed);
      if (!result.success) {
        return c.body(null, 400);
      }

      const report = result.data["csp-report"];
      if (!isFromOurApp(report["document-uri"], deps.appUrl)) {
        return c.body(null, 204);
      }
      await emitCspEvent(deps.outbox, ip, {
        documentUri: report["document-uri"].slice(0, 2048),
        blockedUri: report["blocked-uri"].slice(0, 2048),
        violatedDirective: report["violated-directive"].slice(0, 128),
        effectiveDirective: report["effective-directive"].slice(0, 64),
        disposition: report.disposition ?? "enforce",
        sourceFile: report["source-file"]?.slice(0, 2048),
        sample: report["script-sample"]?.slice(0, 100),
        lineNumber: report["line-number"],
        columnNumber: report["column-number"],
      });

      return c.body(null, 204);
    },
  );

  return app;
}

type CspViolationFields = {
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  disposition: "enforce" | "report";
  sourceFile?: string;
  sample?: string;
  lineNumber?: number;
  columnNumber?: number;
};

async function emitCspEvent(
  outbox: IOutboxRepository,
  ip: string,
  fields: CspViolationFields,
): Promise<void> {
  try {
    await emitEvent(outbox, EventTypes.SECURITY_CSP_VIOLATION, "csp_report", ip, {
      actorUserId: null,
      ip,
      ...fields,
    });
  } catch (emitErr) {
    logger.warn({ err: emitErr }, "csp-report event emit failed — still sending 204");
  }
}
