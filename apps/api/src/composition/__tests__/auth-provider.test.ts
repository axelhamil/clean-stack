import { describe, expect, it, mock } from "bun:test";
import { NoOpInstrumentation } from "@packages/ddd-kit";

const seen: { body?: unknown; cookie: string | null }[] = [];

function upstream(status: number, cookies: string[]): Response {
  const response = new Response(JSON.stringify({ ok: status < 400 }), { status });
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);

  return response;
}

let impersonateAnswer = upstream(200, []);
let stopAnswer = upstream(200, []);

mock.module("../../auth", () => ({
  auth: {
    api: {
      impersonateUser: mock(async (input: { body: unknown; headers: Headers }) => {
        seen.push({ body: input.body, cookie: input.headers.get("cookie") });

        return impersonateAnswer;
      }),
      stopImpersonating: mock(async (input: { headers: Headers }) => {
        seen.push({ cookie: input.headers.get("cookie") });

        return stopAnswer;
      }),
    },
  },
}));

const { BetterAuthProvider } = await import("../auth-provider");

const provider = new BetterAuthProvider(new NoOpInstrumentation());
const STAFF_REQUEST: [string, string][] = [
  ["content-type", "application/json"],
  ["cookie", "better-auth.session_token=staff; theme=dark"],
];
const ISSUED = [
  "better-auth.session_token=impersonated.sig; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax",
  "better-auth.admin_session=staff.sig; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax",
  "better-auth.session_data=; Max-Age=0; Path=/",
];

describe("BetterAuthProvider impersonation", () => {
  it("forwards the staff cookies and hands back every issued cookie, attributes and order kept", async () => {
    seen.length = 0;
    impersonateAnswer = upstream(200, ISSUED);

    const started = await provider.impersonateUser("user-2", STAFF_REQUEST);

    expect(started.isSuccess).toBe(true);
    expect(started.getValue()).toEqual(ISSUED);
    expect(seen).toEqual([
      { body: { userId: "user-2" }, cookie: "better-auth.session_token=staff; theme=dark" },
    ]);
  });

  it("refuses with the start code when the library answers an error", async () => {
    impersonateAnswer = upstream(403, []);

    const refused = await provider.impersonateUser("user-2", STAFF_REQUEST);

    expect(refused.isFailure).toBe(true);
    expect(refused.getError()).toEqual({
      code: "ADMIN_IMPERSONATION_FORBIDDEN",
      message: "The impersonation request was refused.",
    });
  });

  it("hands back the restored cookies of a stop, and its own code on a refusal", async () => {
    stopAnswer = upstream(200, ISSUED.slice(0, 1));

    const stopped = await provider.stopImpersonating(STAFF_REQUEST);

    expect(stopped.getValue()).toEqual(ISSUED.slice(0, 1));

    stopAnswer = upstream(401, []);
    const refused = await provider.stopImpersonating(STAFF_REQUEST);

    expect(refused.isFailure).toBe(true);
    expect(refused.getError().code).toBe("ADMIN_STOP_IMPERSONATION_FORBIDDEN");
  });
});
