import { BlockList, isIPv4, isIPv6 } from "node:net";
import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { env } from "../env";

/**
 * Strip IPv4 `:port` suffix (a.b.c.d:port) and IPv6 zone-id (%...) so
 * raw socket addresses with ports or zone identifiers compare equal to
 * the clean IPs stored in TRUSTED_PROXIES.
 */
export function normalizeHop(hop: string): string {
  const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(hop);
  if (ipv4Port) return ipv4Port[1] as string;
  const bracketPort = /^\[([^\]]+)\]:\d+$/.exec(hop);
  if (bracketPort) {
    const inner = bracketPort[1] as string;
    const zoneIdx = inner.indexOf("%");
    return zoneIdx !== -1 ? inner.slice(0, zoneIdx) : inner;
  }
  const zoneIdx = hop.indexOf("%");
  if (zoneIdx !== -1) return hop.slice(0, zoneIdx);
  return hop;
}

// The `private` keyword expands to every range that is unreachable from the public
// internet — on a PaaS (Railway, Fly, …) the only hop that can connect to the container
// is the platform's edge proxy over the private network, so trusting these is safe and
// avoids pinning a non-stable internal IP. Mirrors Caddy's `trusted_proxies private_ranges`.
const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
];
const PRIVATE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
];

let cachedRef: readonly string[] | undefined;
let cachedList: BlockList | null | undefined;

function buildList(entries: readonly string[]): BlockList {
  const bl = new BlockList();
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === "private") {
      for (const [net, prefix] of PRIVATE_V4) bl.addSubnet(net, prefix, "ipv4");
      for (const [net, prefix] of PRIVATE_V6) bl.addSubnet(net, prefix, "ipv6");
      continue;
    }
    const slash = entry.indexOf("/");
    if (slash !== -1) {
      const addr = entry.slice(0, slash);
      const prefix = Number(entry.slice(slash + 1));
      if (!Number.isInteger(prefix) || prefix < 0) continue;
      if (isIPv4(addr) && prefix <= 32) bl.addSubnet(addr, prefix, "ipv4");
      else if (isIPv6(addr) && prefix <= 128) bl.addSubnet(addr, prefix, "ipv6");
      continue;
    }
    if (isIPv4(entry)) bl.addAddress(entry, "ipv4");
    else if (isIPv6(entry)) bl.addAddress(entry, "ipv6");
  }
  return bl;
}

function trustedList(): BlockList | null {
  const entries = env.TRUSTED_PROXIES;
  if (!entries || entries.length === 0) return null;
  if (entries === cachedRef) return cachedList ?? null;
  cachedRef = entries;
  cachedList = buildList(entries);
  return cachedList;
}

function isTrusted(ip: string, list: BlockList): boolean {
  if (isIPv4(ip)) return list.check(ip, "ipv4");
  if (isIPv6(ip)) return list.check(ip, "ipv6");
  return false;
}

export function resolveClientIp(c: Context): string {
  const rawSocket = getConnInfo(c).remote.address ?? "";
  const socketAddr = normalizeHop(rawSocket);
  const list = trustedList();

  if (!list || !isTrusted(socketAddr, list)) return socketAddr || "unknown";

  const xff = c.req.header("x-forwarded-for");
  if (!xff) return socketAddr || "unknown";

  // OWASP rightmost-non-trusted: walk XFF from right, skip trusted entries,
  // return the first non-trusted entry. Real client IP regardless of proxy chain depth.
  const hops = xff.split(",").map((h) => normalizeHop(h.trim()));
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop && !isTrusted(hop, list)) return hop;
  }

  return socketAddr || "unknown";
}
