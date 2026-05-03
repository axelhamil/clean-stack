import { describe, expect, it } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { errorHandler } from "../error.middleware";

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    c.set("requestId", "req-test-123");
    await next();
  });
  app.onError(errorHandler);
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
});
