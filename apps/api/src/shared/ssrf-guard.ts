import { BlockList, isIPv4, isIPv6 } from "node:net";
import { PRIVATE_V4, PRIVATE_V6 } from "./private-ranges";

let cachedList: BlockList | undefined;

function privateBlockList(): BlockList {
  if (cachedList) return cachedList;
  const bl = new BlockList();
  for (const [net, prefix] of PRIVATE_V4) bl.addSubnet(net, prefix, "ipv4");
  for (const [net, prefix] of PRIVATE_V6) bl.addSubnet(net, prefix, "ipv6");
  bl.addAddress("0.0.0.0", "ipv4");
  cachedList = bl;
  return bl;
}

function unwrapIpv4Mapped(ip: string): string | null {
  if (!ip.toLowerCase().startsWith("::ffff:")) return null;
  const tail = ip.slice(7);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail)) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1] as string, 16);
  const lo = Number.parseInt(hex[2] as string, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

export function isPrivateOrReservedAddress(ip: string): boolean {
  if (isIPv4(ip)) return privateBlockList().check(ip, "ipv4");
  if (isIPv6(ip)) {
    const mapped = unwrapIpv4Mapped(ip);
    if (mapped) return isPrivateOrReservedAddress(mapped);
    return privateBlockList().check(ip, "ipv6");
  }
  return true;
}
