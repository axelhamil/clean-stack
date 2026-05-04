import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

let mockedAddress = "::1";

mock.module("hono/bun", () => ({
  getConnInfo: () => ({ remote: { address: mockedAddress } }),
}));

const { requirePrivateNetwork } = await import("../middleware/private-network.middleware");

async function statusFor(address: string): Promise<number> {
  mockedAddress = address;
  const app = new Hono().get("/secure", requirePrivateNetwork, (c) => c.json({ ok: true }));
  const res = await app.request("/secure");
  return res.status;
}

describe("requirePrivateNetwork", () => {
  it("should accept loopback (::1)", async () => {
    expect(await statusFor("::1")).toBe(200);
  });

  it("should accept IPv6 ULA (Railway/Fly internal mesh)", async () => {
    expect(await statusFor("fd00::beef")).toBe(200);
  });

  it("should reject public IPv4", async () => {
    expect(await statusFor("8.8.8.8")).toBe(401);
  });

  it("should reject IPv4-mapped IPv6 carrying a public IPv4 (the gotcha — `::ffff:x.x.x.x`)", async () => {
    expect(await statusFor("::ffff:8.8.8.8")).toBe(401);
  });

  it("should reject when source IP is missing (safe-by-default)", async () => {
    expect(await statusFor("")).toBe(401);
  });
});
