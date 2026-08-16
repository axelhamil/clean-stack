import { afterEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IOutboxRepository } from "../ports/outbox.port";

mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: { address: "1.2.3.4" } }),
}));

const warnSpy = mock(() => {});
const debugSpy = mock(() => {});
mock.module("../logger", () => ({
  logger: { warn: warnSpy, info: () => {}, error: () => {}, debug: debugSpy },
}));

// Superset of @packages/drizzle exports used across the full test suite.
mock.module("@packages/drizzle", () => ({
  db: {},
  outboxSchema: {},
  auditLogSchema: {},
  webhooksSchema: {},
  authSchema: {},
  multiTenantSchema: {},
  schema: {},
  rateLimitSchema: {},
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  notificationSchema: {
    notification: {
      id: { name: "id" },
      userId: { name: "user_id" },
      organizationId: { name: "organization_id" },
      category: { name: "category" },
      eventType: { name: "event_type" },
      groupKey: { name: "group_key" },
      dedupKey: { name: "dedup_key" },
      payload: { name: "payload" },
      readAt: { name: "read_at" },
      emailPendingAt: { name: "email_pending_at" },
      emailSentAt: { name: "email_sent_at" },
      createdAt: { name: "created_at" },
    },
    notificationPreference: {
      id: { name: "id" },
      scope: { name: "scope" },
      scopeId: { name: "scope_id" },
      category: { name: "category" },
      channel: { name: "channel" },
      enabled: { name: "enabled" },
      frequency: { name: "frequency" },
      locked: { name: "locked" },
    },
  },
  inArray: () => {},
  eq: () => {},
  lt: () => {},
  isNotNull: () => {},
  asc: () => {},
  desc: () => {},
  and: () => {},
  sql: Object.assign(() => {}, { raw: () => ({}), identifier: () => ({}) }),
}));

const { cspReportCors, makeCspReportApp } = await import("../internal-routes/csp-report.route");

function makeOutbox(): IOutboxRepository {
  return {
    enqueue: mock(async () => {}),
    findPendingBatch: async () => [],
    markDispatched: async () => {},
    markFailed: async () => {},
  };
}

const VALID_LEGACY_BODY = JSON.stringify({
  "csp-report": {
    "document-uri": "https://example.com/page",
    "blocked-uri": "https://evil.com/script.js",
    "violated-directive": "script-src 'self'",
    "effective-directive": "script-src",
    disposition: "enforce",
  },
});

const VALID_REPORTS_JSON_BODY = JSON.stringify([
  {
    type: "csp-violation",
    url: "https://example.com/page",
    body: {
      documentURL: "https://example.com/page",
      blockedURL: "https://evil.com/script.js",
      effectiveDirective: "script-src",
      disposition: "enforce",
      sample: "alert(document.cookie)",
      lineNumber: "42",
    },
  },
]);

describe("POST /csp-report", () => {
  afterEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
  });

  describe("legacy application/csp-report", () => {
    it("valid report → 204 + event emitted with correct payload", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: VALID_LEGACY_BODY,
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);

      const [events, scope] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ eventType: string; payload: Record<string, unknown> }>,
        { aggregateType: string },
      ];
      expect(events[0]?.eventType).toBe("security.csp.violation");
      expect(scope.aggregateType).toBe("csp_report");
      const payload = events[0]?.payload;
      expect(payload?.actorUserId).toBeNull();
      expect(payload?.documentUri).toBe("https://example.com/page");
      expect(payload?.blockedUri).toBe("https://evil.com/script.js");
      expect(payload?.violatedDirective).toBe("script-src 'self'");
      expect(payload?.effectiveDirective).toBe("script-src");
      expect(payload?.disposition).toBe("enforce");
    });
  });

  describe("application/reports+json", () => {
    it("single-item batch → 204 + one event, sample captured + string lineNumber coerced", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body: VALID_REPORTS_JSON_BODY,
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      const payload = events[0]?.payload;
      expect(payload?.sample).toBe("alert(document.cookie)");
      expect(payload?.lineNumber).toBe(42);
    });

    it("empty array → 204 without event", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body: "[]",
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("multi-violation batch → single event from first violation + debug log", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const body = JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://example.com/first",
            blockedURL: "https://evil.com/a.js",
            effectiveDirective: "script-src",
            disposition: "enforce",
          },
        },
        {
          type: "csp-violation",
          body: {
            documentURL: "https://example.com/second",
            blockedURL: "https://evil.com/b.js",
            effectiveDirective: "style-src",
            disposition: "enforce",
          },
        },
      ]);

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body,
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      expect(events[0]?.payload?.documentUri).toBe("https://example.com/first");
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const debugArg = (debugSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
      expect(debugArg.ignored).toBe(1);
    });

    it("array with no csp-violation entries → 204 without event", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const body = JSON.stringify([{ type: "deprecation", body: {} }]);

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body,
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("origin filter (anti-spam)", () => {
    it("drops a report whose document-uri is not our app → 204 without event", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox, appUrl: "https://app.example.com" });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://attacker.test/spam",
            "blocked-uri": "inline",
            "violated-directive": "script-src",
            "effective-directive": "script-src",
          },
        }),
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("keeps a report whose document-uri matches our app origin → event emitted", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox, appUrl: "https://app.example.com" });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body: JSON.stringify([
          {
            type: "csp-violation",
            body: {
              documentURL: "https://app.example.com/dashboard",
              blockedURL: "https://evil.test/x.js",
              effectiveDirective: "script-src",
            },
          },
        ]),
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    });

    it("malformed document-uri is dropped when appUrl is set → 204 without event", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox, appUrl: "https://app.example.com" });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "not-a-url",
            "blocked-uri": "inline",
            "violated-directive": "script-src",
            "effective-directive": "script-src",
          },
        }),
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("malformed JSON → 400", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: "not json {{{",
      });

      expect(res.status).toBe(400);
    });

    it("legacy shape missing required fields → 400", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: JSON.stringify({ "csp-report": { "document-uri": "https://example.com" } }),
      });

      expect(res.status).toBe(400);
    });

    it("reports+json with non-array root → 400", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/reports+json" },
        body: JSON.stringify({ type: "csp-violation" }),
      });

      expect(res.status).toBe(400);
    });

    it("body > 64 KB → 413", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const oversized = "x".repeat(66 * 1024);

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: oversized,
      });

      expect(res.status).toBe(413);
    });
  });

  describe("field truncation", () => {
    it("over-long fields are truncated, not rejected", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const longUri = `https://example.com/${"a".repeat(3000)}`;
      const body = JSON.stringify({
        "csp-report": {
          "document-uri": longUri,
          "blocked-uri": longUri,
          "violated-directive": "b".repeat(200),
          "effective-directive": "c".repeat(100),
          disposition: "enforce",
        },
      });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body,
      });

      expect(res.status).toBe(204);
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);

      const [events] = (outbox.enqueue as ReturnType<typeof mock>).mock.calls[0] as [
        Array<{ payload: Record<string, unknown> }>,
      ];
      const payload = events[0]?.payload;
      expect((payload?.documentUri as string).length).toBe(2048);
      expect((payload?.blockedUri as string).length).toBe(2048);
      expect((payload?.violatedDirective as string).length).toBe(128);
      expect((payload?.effectiveDirective as string).length).toBe(64);
    });
  });

  describe("emit failure resilience", () => {
    it("emitEvent throws → still returns 204 + logger.warn called", async () => {
      const outbox: IOutboxRepository = {
        enqueue: mock(async () => {
          throw new Error("outbox down");
        }),
        findPendingBatch: async () => [],
        markDispatched: async () => {},
        markFailed: async () => {},
      };
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report" },
        body: VALID_LEGACY_BODY,
      });

      expect(res.status).toBe(204);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnArg = (warnSpy.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
      expect((warnArg.err as Error).message).toBe("outbox down");
    });
  });

  describe("CORS preflight", () => {
    it("OPTIONS /csp-report returns CORS headers allowing any origin", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(res.status).toBe(204);
      const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
      expect(allowOrigin).toBe("*");
    });

    it("OPTIONS from null origin (sandboxed iframe) returns wildcard", async () => {
      const outbox = makeOutbox();
      const app = makeCspReportApp({ outbox });

      const res = await app.request("/csp-report", {
        method: "OPTIONS",
        headers: {
          Origin: "null",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("composed like index.ts: mounted before the global cors, the permissive cors + cross-origin CORP win", async () => {
      const outbox = makeOutbox();
      const root = new Hono();
      root.use("/csp-report", cspReportCors);
      root.route("/", makeCspReportApp({ outbox }));
      root.use("*", cors({ origin: ["http://localhost:5173"], credentials: true }));

      const res = await root.request("/csp-report", {
        method: "OPTIONS",
        headers: {
          Origin: "null",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

      const post = await root.request("/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/csp-report", Origin: "null" },
        body: VALID_LEGACY_BODY,
      });
      expect(post.status).toBe(204);
      expect(post.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    });
  });
});
