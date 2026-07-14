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

export function isPrivateOrReservedAddress(ip: string): boolean {
  if (isIPv4(ip)) return privateBlockList().check(ip, "ipv4");
  if (isIPv6(ip)) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    const inner = mapped?.[1];
    if (inner) return isPrivateOrReservedAddress(inner);
    return privateBlockList().check(ip, "ipv6");
  }
  return true;
}
