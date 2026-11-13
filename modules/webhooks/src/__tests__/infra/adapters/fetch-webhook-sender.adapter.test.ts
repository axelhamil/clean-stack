import { afterEach, describe, expect, it } from "bun:test";
import type { IInstrumentation } from "@packages/ddd-kit";
import type { PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { type Server, serve, sleep } from "bun";
import { FetchWebhookSender } from "../../../infra/adapters/fetch-webhook-sender.adapter";

interface Received {
  method: string;
  headers: Record<string, string>;
  body: string;
}

const servers: Server<undefined>[] = [];

function receiver(answer: () => Response) {
  const received: Received[] = [];
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      received.push({
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return answer();
    },
  });
  servers.push(server);

  return { received, url: `http://127.0.0.1:${server.port}/hook` };
}

function sender(instrumentation: PortMock<IInstrumentation> = mockInstrumentation(), cap = 4096) {
  return new FetchWebhookSender(instrumentation, cap);
}

describe("FetchWebhookSender", () => {
  afterEach(() => {
    for (const server of servers.splice(0)) server.stop(true);
  });

  it("posts the body and headers and returns the response", async () => {
    const endpoint = receiver(
      () =>
        new Response("thanks", {
          status: 202,
          statusText: "Accepted",
          headers: { "x-receiver": "ok" },
        }),
    );

    const result = await sender().send({
      url: endpoint.url,
      headers: { "content-type": "application/json", "x-webhook-signature": "t=1,v1=abc" },
      body: '{"id":"evt-1"}',
    });

    expect(endpoint.received).toEqual([
      {
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-webhook-signature": "t=1,v1=abc",
        }),
        body: '{"id":"evt-1"}',
      },
    ]);
    const response = result.getValue();
    expect(response.status).toBe(202);
    expect(response.statusText).toBe("Accepted");
    expect(response.headers).toMatchObject({ "x-receiver": "ok" });
    expect(response.body.unwrap()).toBe("thanks");
  });

  it.each([307, 308])("returns a %i without following it to its target", async (status) => {
    const target = receiver(() => new Response(null, { status: 200 }));
    const endpoint = receiver(
      () => new Response(null, { status, headers: { location: target.url } }),
    );

    const result = await sender().send({ url: endpoint.url, headers: {}, body: "{}" });

    expect(target.received).toEqual([]);
    expect(endpoint.received).toHaveLength(1);
    expect(result.getValue().status).toBe(status);
    expect(result.getValue().headers).toMatchObject({ location: target.url });
  });

  it("caps the captured response body", async () => {
    const endpoint = receiver(() => new Response("x".repeat(8192), { status: 200 }));

    const result = await sender(mockInstrumentation(), 4096).send({
      url: endpoint.url,
      headers: {},
      body: "{}",
    });

    expect(result.getValue().body.unwrap()).toBe("x".repeat(4096));
  });

  it("keeps the status and headers when the body breaks after the response arrived", async () => {
    const endpoint = receiver(() => {
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sent) {
            await sleep(20);
            return controller.error(new Error("socket closed"));
          }
          sent = true;
          controller.enqueue(new TextEncoder().encode("partial"));
        },
      });

      return new Response(body, { status: 200, headers: { "x-receiver": "ok" } });
    });
    const instrumentation = mockInstrumentation();

    const result = await sender(instrumentation).send({
      url: endpoint.url,
      headers: {},
      body: "{}",
    });

    expect(result.isSuccess).toBe(true);
    const response = result.getValue();
    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({ "x-receiver": "ok" });
    expect(response.readError.isSome()).toBe(true);
    expect(instrumentation.capture).toHaveBeenCalled();
  });

  it("fails with the error text and reports it when the request cannot be made", async () => {
    const closed = receiver(() => new Response(null, { status: 200 }));
    for (const server of servers.splice(0)) server.stop(true);
    const instrumentation = mockInstrumentation();

    const result = await sender(instrumentation).send({ url: closed.url, headers: {}, body: "{}" });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/^\w*Error: /);
    expect(instrumentation.capture).toHaveBeenCalled();
  });
});
