import { describe, expect, it, mock } from "bun:test";
import { HttpHeartbeat } from "../http-heartbeat";

const BASE_URL = "https://hc.example.com/ping/secret-uuid";

function given(answer: () => Promise<Response> = async () => new Response(null, { status: 200 })) {
  const fetchFn = mock<(url: string, init: RequestInit) => Promise<Response>>(answer);
  const report = mock<(message: string) => void>();
  const pinged = () => fetchFn.mock.calls.map(([url]) => url);

  return { fetchFn, report, pinged };
}

describe("HttpHeartbeat", () => {
  it("no url configured means no request", async () => {
    const { fetchFn, report } = given();
    const beat = new HttpHeartbeat(undefined, report, fetchFn);

    await beat.start();
    await beat.finish(1);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("start, success and failure hit /start, the base url and /fail", async () => {
    const { fetchFn, report, pinged } = given();
    const beat = new HttpHeartbeat(`${BASE_URL}//`, report, fetchFn);

    await beat.start();
    await beat.finish(0);
    await beat.finish(2);

    expect(pinged()).toEqual([`${BASE_URL}/start`, BASE_URL, `${BASE_URL}/fail`]);
    expect(report).not.toHaveBeenCalled();
  });

  it("a url with a query string gets the suffix on its path and keeps the query", async () => {
    const { fetchFn, report, pinged } = given();
    const beat = new HttpHeartbeat(`${BASE_URL}/?rid=run-1`, report, fetchFn);

    await beat.start();
    await beat.finish(0);
    await beat.finish(1);

    expect(pinged()).toEqual([
      `${BASE_URL}/start?rid=run-1`,
      `${BASE_URL}?rid=run-1`,
      `${BASE_URL}/fail?rid=run-1`,
    ]);
  });

  it("a network error is reported by name without the url and never thrown", async () => {
    const { fetchFn, report } = given(() => Promise.reject(new TypeError(`fetch ${BASE_URL}`)));
    const beat = new HttpHeartbeat(BASE_URL, report, fetchFn);

    await beat.start();

    expect(report.mock.calls).toEqual([["heartbeat ping failed: TypeError"]]);
  });

  it("a non 2xx answer is reported with its status", async () => {
    const { fetchFn, report } = given(async () => new Response(null, { status: 503 }));
    const beat = new HttpHeartbeat(BASE_URL, report, fetchFn);

    await beat.finish(0);

    expect(report.mock.calls).toEqual([["heartbeat ping answered 503"]]);
  });
});
