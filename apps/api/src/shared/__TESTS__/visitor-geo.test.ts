import { afterEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { validateSecuritySignalsEnv } from "../env-bounds";

let socketAddress = "10.0.0.1";

const realHonoBun = await import("hono/bun");
mock.module("hono/bun", () => ({
  ...realHonoBun,
  getConnInfo: () => ({ remote: { address: socketAddress } }),
}));

const { env } = await import("../env");
const { resolveVisitorGeo } = await import("../middleware/visitor-geo");
const { HeaderIpGeoService } = await import("../services/header-ip-geo.service");

const SPOOFED = { "cf-ipcountry": "kp", "cf-ipasn": "AS64496" };

function setTrustedProxies(value: string[] | undefined) {
  Object.assign(env, { TRUSTED_PROXIES: value });
}

async function resolve(
  config: { countryHeader?: string; asnHeader?: string },
  headers: Record<string, string>,
) {
  const service = new HeaderIpGeoService(config);
  const app = new Hono();
  app.get("/geo", (c) => {
    const geo = resolveVisitorGeo(c, service);

    return c.json({ country: geo.country.toNull(), asn: geo.asn.toNull() });
  });

  return (await app.request("/geo", { headers })).json();
}

describe("resolveVisitorGeo", () => {
  afterEach(() => {
    setTrustedProxies(undefined);
    socketAddress = "10.0.0.1";
  });

  it("given no header named by the env, when the request carries one, then it is ignored", async () => {
    setTrustedProxies(["10.0.0.1"]);

    expect(await resolve({}, SPOOFED)).toEqual({ country: null, asn: null });
  });

  it("given a named header and a trusted proxy, when the request carries it, then it is normalised", async () => {
    setTrustedProxies(["10.0.0.1"]);

    expect(
      await resolve({ countryHeader: "CF-IPCountry", asnHeader: "CF-IPASN" }, SPOOFED),
    ).toEqual({ country: "KP", asn: "64496" });
  });

  it("given a named header and a peer outside the trusted proxies, when it spoofs the header, then it is ignored", async () => {
    setTrustedProxies(["10.0.0.1"]);
    socketAddress = "198.51.100.9";

    expect(
      await resolve({ countryHeader: "CF-IPCountry", asnHeader: "CF-IPASN" }, SPOOFED),
    ).toEqual({ country: null, asn: null });
  });

  it.each(["XX", "france", ""])(
    "given the unusable country %p, then it counts as unknown",
    async (value) => {
      setTrustedProxies(["10.0.0.1"]);

      expect(await resolve({ countryHeader: "CF-IPCountry" }, { "cf-ipcountry": value })).toEqual({
        country: null,
        asn: null,
      });
    },
  );
});

describe("validateSecuritySignalsEnv", () => {
  const schema = z
    .object({
      TRUSTED_PROXIES: z.array(z.string()).optional(),
      GEO_COUNTRY_HEADER: z.string().optional(),
      GEO_ASN_HEADER: z.string().optional(),
      IMPOSSIBLE_TRAVEL_WINDOW_MINUTES: z.number().optional(),
      SECURITY_DENY_COUNTRIES: z.array(z.string()),
      SECURITY_DENY_ASNS: z.array(z.string()),
    })
    .superRefine(validateSecuritySignalsEnv);
  const base = { SECURITY_DENY_COUNTRIES: [], SECURITY_DENY_ASNS: [] };
  const issuesOf = (value: unknown) =>
    schema.safeParse(value).error?.issues.map((issue) => issue.path[0]) ?? [];

  it("given every flag off, then the boot passes", () => {
    expect(issuesOf(base)).toEqual([]);
  });

  it("given a geo header without trusted proxies, then the boot fails", () => {
    expect(issuesOf({ ...base, GEO_COUNTRY_HEADER: "CF-IPCountry" })).toEqual(["TRUSTED_PROXIES"]);
  });

  it.each([
    ["GEO_COUNTRY_HEADER", "CF IPCountry"],
    ["GEO_ASN_HEADER", ""],
  ])("given %s=%j, then the boot fails on a name no request can carry", (name, header) => {
    expect(issuesOf({ ...base, TRUSTED_PROXIES: ["private"], [name]: header })).toEqual([name]);
  });

  it.each(["FRA", "F", "1A", "F!"])("given the deny country %s, then the boot fails", (country) => {
    expect(
      issuesOf({
        ...base,
        TRUSTED_PROXIES: ["private"],
        GEO_COUNTRY_HEADER: "CF-IPCountry",
        SECURITY_DENY_COUNTRIES: [country],
      }),
    ).toEqual(["SECURITY_DENY_COUNTRIES"]);
  });

  it.each(["abc", "12345678901"])("given the deny ASN %s, then the boot fails", (asn) => {
    expect(
      issuesOf({
        ...base,
        TRUSTED_PROXIES: ["private"],
        GEO_ASN_HEADER: "CF-IPASN",
        SECURITY_DENY_ASNS: [asn],
      }),
    ).toEqual(["SECURITY_DENY_ASNS"]);
  });

  it.each(["nope", "10.0.0.0/33", "10.0.0.0/", "fd00::/129", "10.0.0.0/8/8", "1.2.3"])(
    "given the trusted proxy %s, then the boot fails",
    (entry) => {
      expect(issuesOf({ ...base, TRUSTED_PROXIES: [entry] })).toEqual(["TRUSTED_PROXIES"]);
    },
  );

  it("given every accepted shape, then the boot passes", () => {
    expect(
      issuesOf({
        TRUSTED_PROXIES: ["private", "10.0.0.0/8", "fd00::/8", "203.0.113.7", "::1"],
        GEO_COUNTRY_HEADER: "CF-IPCountry",
        GEO_ASN_HEADER: "CF-IPASN",
        SECURITY_DENY_COUNTRIES: ["KP", "A1"],
        SECURITY_DENY_ASNS: ["64496"],
      }),
    ).toEqual([]);
  });

  it("given a signal without the header it reads, then the boot fails instead of staying inert", () => {
    expect(
      issuesOf({
        ...base,
        IMPOSSIBLE_TRAVEL_WINDOW_MINUTES: 60,
        SECURITY_DENY_COUNTRIES: ["KP"],
        SECURITY_DENY_ASNS: ["64496"],
      }),
    ).toEqual([
      "IMPOSSIBLE_TRAVEL_WINDOW_MINUTES",
      "SECURITY_DENY_COUNTRIES",
      "SECURITY_DENY_ASNS",
    ]);
  });
});
