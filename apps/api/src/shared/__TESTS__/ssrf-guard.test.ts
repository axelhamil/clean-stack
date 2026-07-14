import { describe, expect, it } from "bun:test";
import { isPrivateOrReservedAddress } from "../ssrf-guard";

describe("isPrivateOrReservedAddress", () => {
  it("blocks private/reserved v4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.5.4",
      "192.168.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(isPrivateOrReservedAddress(ip)).toBe(true);
    }
  });

  it("blocks private/reserved v6 + ipv4-mapped", () => {
    expect(isPrivateOrReservedAddress("::1")).toBe(true);
    expect(isPrivateOrReservedAddress("fe80::1")).toBe(true);
    expect(isPrivateOrReservedAddress("fc00::1")).toBe(true);
    expect(isPrivateOrReservedAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateOrReservedAddress("93.184.216.34")).toBe(false);
    expect(isPrivateOrReservedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateOrReservedAddress("not-an-ip")).toBe(true);
  });
});
