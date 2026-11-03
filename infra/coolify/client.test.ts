import { describe, expect, it } from "bun:test";
import { CoolifyClient, type FetchFn } from "./client";
import { parseDigestRef } from "./services";

const DIGEST = "a".repeat(64);
const IMAGE = `ghcr.io/acme/clean-stack-api@sha256:${DIGEST}`;
const FAST = { timeoutMs: 1_000, pollMs: 1 };

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function recordingFetch(answer: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    const call = {
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : "",
    };
    calls.push(call);

    return answer(call, calls.length - 1);
  };

  return { calls, fetchFn };
}

function sequence(...steps: (() => Response)[]) {
  return recordingFetch((_call, index) => {
    const step = steps[Math.min(index, steps.length - 1)];

    if (!step) {
      throw new Error("no answer");
    }

    return step();
  });
}

const status = (value: string) => () => Response.json({ status: value });

const clientOf = (fetchFn: FetchFn) =>
  new CoolifyClient("https://coolify.test", "token", fetchFn, { retryDelayMs: 1 });

describe("CoolifyClient", () => {
  it.each([
    "ghcr.io/acme/clean-stack-api:latest",
    "ghcr.io/acme/clean-stack-api:sha-3f2a1b",
    `ghcr.io/acme/clean-stack-api@sha256:${"a".repeat(63)}`,
    `docker.io/acme/clean-stack-api@sha256:${DIGEST}`,
    `ghcr.io/acme/other-api@sha256:${DIGEST}`,
    `ghcr.io/acme/clean-stack-worker@sha256:${DIGEST}`,
  ])("refuses %s before any call", async (ref) => {
    const { calls, fetchFn } = recordingFetch(() => Response.json({}));
    const client = clientOf(fetchFn);

    expect(() => parseDigestRef(ref)).toThrow(/sha256 digest/);
    await expect(client.deploy("app-uuid", ref)).rejects.toThrow(/sha256 digest/);
    expect(calls).toHaveLength(0);
  });

  it("reads the owner and the app from a digest reference", () => {
    expect(parseDigestRef(IMAGE)).toEqual({ ref: IMAGE, owner: "acme", name: "api" });
  });

  it("pins the digest, starts the deployment with the bearer token and returns its id", async () => {
    const { calls, fetchFn } = recordingFetch((call) =>
      call.url.includes("/api/v1/deploy")
        ? Response.json({ deployments: [{ deployment_uuid: "deploy-1" }] })
        : Response.json({}),
    );
    const client = clientOf(fetchFn);

    const id = await client.deploy("app-uuid", IMAGE);

    expect(id).toBe("deploy-1");
    expect(calls.every((call) => call.headers.get("authorization") === "Bearer token")).toBe(true);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      docker_registry_image_name: "ghcr.io/acme/clean-stack-api",
      docker_registry_image_tag: `sha256:${DIGEST}`,
    });
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url).toBe("https://coolify.test/api/v1/deploy?uuid=app-uuid&force=false");
  });

  it("waits until the deployment is finished", async () => {
    const { calls, fetchFn } = sequence(
      status("in_progress"),
      status("in_progress"),
      status("finished"),
    );
    const client = clientOf(fetchFn);

    await client.waitForDeployment("deploy-1", FAST);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toBe("https://coolify.test/api/v1/deployments/deploy-1");
  });

  it("fails on a failed deployment, naming the status", async () => {
    const { fetchFn } = sequence(status("in_progress"), status("failed"));
    const client = clientOf(fetchFn);

    await expect(client.waitForDeployment("deploy-1", FAST)).rejects.toThrow(/status failed/);
  });

  it("fails after the timeout", async () => {
    const { fetchFn } = sequence(status("in_progress"));
    const client = clientOf(fetchFn);

    await expect(
      client.waitForDeployment("deploy-1", { timeoutMs: 20, pollMs: 5 }),
    ).rejects.toThrow(/timed out/);
  });

  it("retries a transient failure while polling, three times at most", async () => {
    const { calls, fetchFn } = sequence(
      () => new Response("", { status: 502 }),
      () => {
        throw new Error("connection reset");
      },
      status("finished"),
    );
    const failing = sequence(() => new Response("", { status: 503 }));
    const client = clientOf(fetchFn);
    const broken = clientOf(failing.fetchFn);

    await client.waitForDeployment("deploy-1", FAST);

    expect(calls).toHaveLength(3);
    await expect(broken.waitForDeployment("deploy-1", FAST)).rejects.toThrow(/503/);
    expect(failing.calls).toHaveLength(4);
  });

  it("fails the poll at once on a client error", async () => {
    const { calls, fetchFn } = sequence(() => new Response("", { status: 404 }));
    const client = clientOf(fetchFn);

    await expect(client.waitForDeployment("deploy-1", FAST)).rejects.toThrow(/404/);
    expect(calls).toHaveLength(1);
  });

  it("gives up on a call Coolify never answers", async () => {
    const hanging: FetchFn = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const client = new CoolifyClient("https://coolify.test", "token", hanging, { timeoutMs: 10 });

    await expect(client.listApplicationSummaries("1")).rejects.toThrow();
  });

  it("lists only the apps of the asked environment and ignores preview variables", async () => {
    const { calls, fetchFn } = recordingFetch((call) => {
      if (call.url.endsWith("/api/v1/applications")) {
        return Response.json([
          { uuid: "staging-api", name: "api", environment_id: 1 },
          { uuid: "production-api", name: "api", environment_id: 2 },
        ]);
      }

      if (call.url.endsWith("/envs")) {
        return Response.json([
          { key: "NODE_ENV", value: "production", is_preview: false },
          { key: "NODE_ENV", value: "development", is_preview: true },
        ]);
      }

      return Response.json([]);
    });
    const client = clientOf(fetchFn);

    const apps = await client.listApplications("1");

    expect(apps.map((app) => app.uuid)).toEqual(["staging-api"]);
    expect(apps[0]?.env).toEqual(new Map([["NODE_ENV", "production"]]));
    expect(calls.some((call) => call.url.includes("production-api"))).toBe(false);
  });

  it("reads the executions of the asked tasks only", async () => {
    const { calls, fetchFn } = recordingFetch((call) =>
      call.url.endsWith("/scheduled-tasks")
        ? Response.json([
            { uuid: "task-sweep", name: "sweep", timeout: 1800 },
            { uuid: "task-flush", name: "flush-notification-emails", timeout: 180 },
          ])
        : Response.json([{ status: "running", created_at: new Date().toISOString() }]),
    );

    const running = await clientOf(fetchFn).runningTasks("api-uuid", ["sweep"]);

    expect(running).toEqual(["sweep"]);
    expect(calls.some((call) => call.url.includes("task-flush"))).toBe(false);
  });

  it("takes an empty answer of a write as done", async () => {
    const { fetchFn } = recordingFetch(() => new Response("", { status: 200 }));

    await expect(clientOf(fetchFn).setEnv("uuid", { NODE_ENV: "production" })).resolves.toBe(
      undefined,
    );
  });

  it("names the method, the path and the start of an answer that is not JSON", async () => {
    const { fetchFn } = recordingFetch(() => new Response("<html>bad gateway</html>"));

    await expect(clientOf(fetchFn).listApplicationSummaries("1")).rejects.toThrow(
      "coolify GET /api/v1/applications answered 200 with a body that is not JSON: <html>bad gateway</html>",
    );
  });

  it("never quotes an environment answer that is not JSON", async () => {
    const { fetchFn } = recordingFetch((call) =>
      call.url.endsWith("/api/v1/applications")
        ? Response.json([{ uuid: "staging-api", name: "api", environment_id: 1 }])
        : new Response("STRIPE_SECRET_KEY=sk_live_leak"),
    );

    const failure = await clientOf(fetchFn)
      .listApplications("1")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("/envs");
    expect(String(failure)).not.toContain("sk_live_leak");
  });
});
