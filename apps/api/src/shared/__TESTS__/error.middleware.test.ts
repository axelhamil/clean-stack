import { describe, expect, it, mock } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createErrorHandler } from "../middleware/error.middleware";
import type { IInstrumentation } from "../ports/instrumentation.port";

function makeSpy() {
  const captureSpy = mock(() => {});
  const instrumentation: IInstrumentation = {
    capture: captureSpy,
    startSpan: (_opts, cb) => cb() as ReturnType<typeof cb>,
    addBreadcrumb: () => {},
  };
  return { captureSpy, instrumentation };
}

function makeApp(instrumentation?: IInstrumentation) {
  const { instrumentation: fallback } = makeSpy();
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test-123");
    await next();
  });
  app.onError(createErrorHandler(instrumentation ?? fallback));
  return app;
}

describe("errorHandler", () => {
  it("should map AppErrorException to status from suffix and include code/message/metadata/requestId", async () => {
    const app = makeApp().get("/", () => {
      throw new AppErrorException({
        code: "ACCOUNT_DELETION_BLOCKED",
        message: "blocked",
        metadata: { offendingOrgs: [{ orgId: "o1" }] },
      });
    });
    const res = await app.request("/");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "ACCOUNT_DELETION_BLOCKED",
        message: "blocked",
        requestId: "req-test-123",
        metadata: { offendingOrgs: [{ orgId: "o1" }] },
      },
    });
  });

  it("should wrap HTTPException in the same envelope with HTTP_<status> code", async () => {
    const app = makeApp().get("/", () => {
      throw new HTTPException(401, { message: "Unauthorized" });
    });
    const res = await app.request("/");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "HTTP_401", message: "Unauthorized", requestId: "req-test-123" },
    });
  });

  it("should mask unknown errors as 500 INTERNAL_ERROR with a stack outside production", async () => {
    const app = makeApp().get("/", () => {
      throw new Error("internal leak");
    });
    const res = await app.request("/");
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { code: string; message: string; stack?: string };
    };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal Server Error");
    expect(typeof body.error.stack).toBe("string");
  });

  describe("capture spy — 500 errors", () => {
    it("calls capture on AppErrorException with _PROVIDER_FAILURE suffix (5xx)", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const err = new AppErrorException({
        code: "STORAGE_PROVIDER_FAILURE",
        message: "s3 down",
      });
      const app = makeApp(instrumentation).get("/", () => {
        throw err;
      });
      await app.request("/");
      expect(captureSpy).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          requestId: "req-test-123",
          path: "/",
          method: "GET",
          userId: undefined,
          orgId: undefined,
        }),
      );
    });

    it("calls capture on HTTPException 500", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const err = new HTTPException(500, { message: "gateway fail" });
      const app = makeApp(instrumentation).get("/", () => {
        throw err;
      });
      await app.request("/");
      expect(captureSpy).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          requestId: "req-test-123",
          path: "/",
          method: "GET",
          userId: undefined,
          orgId: undefined,
        }),
      );
    });

    it("calls capture on raw Error (unhandled)", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const err = new Error("unexpected");
      const app = makeApp(instrumentation).get("/", () => {
        throw err;
      });
      await app.request("/");
      expect(captureSpy).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          requestId: "req-test-123",
          path: "/",
          method: "GET",
          userId: undefined,
          orgId: undefined,
        }),
      );
    });
  });

  describe("capture spy — 4xx errors (no capture)", () => {
    it("does NOT call capture on HTTPException 400", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const app = makeApp(instrumentation).get("/", () => {
        throw new HTTPException(400, { message: "bad request" });
      });
      await app.request("/");
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("does NOT call capture on HTTPException 401", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const app = makeApp(instrumentation).get("/", () => {
        throw new HTTPException(401, { message: "unauthorized" });
      });
      await app.request("/");
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("does NOT call capture on HTTPException 403", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const app = makeApp(instrumentation).get("/", () => {
        throw new HTTPException(403, { message: "forbidden" });
      });
      await app.request("/");
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("does NOT call capture on AppErrorException with _NOT_FOUND suffix", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const app = makeApp(instrumentation).get("/", () => {
        throw new AppErrorException({ code: "STORAGE_NOT_FOUND", message: "not found" });
      });
      await app.request("/");
      expect(captureSpy).not.toHaveBeenCalled();
    });

    it("does NOT call capture on AppErrorException with _FORBIDDEN suffix", async () => {
      const { captureSpy, instrumentation } = makeSpy();
      const app = makeApp(instrumentation).get("/", () => {
        throw new AppErrorException({ code: "STORAGE_FORBIDDEN", message: "forbidden" });
      });
      await app.request("/");
      expect(captureSpy).not.toHaveBeenCalled();
    });
  });
});
