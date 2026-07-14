import { describe, expect, it } from "bun:test";
import { type AddressResolver, assertPublicUrl, isPrivateOrReservedAddress } from "../ssrf-guard";

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
    // hex-form ipv4-mapped: ::ffff:7f00:0001 = ::ffff:127.0.0.1
    expect(isPrivateOrReservedAddress("::ffff:7f00:0001")).toBe(true);
    // hex-form ipv4-mapped: ::ffff:0a00:0005 = ::ffff:10.0.0.5
    expect(isPrivateOrReservedAddress("::ffff:0a00:0005")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateOrReservedAddress("93.184.216.34")).toBe(false);
    expect(isPrivateOrReservedAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
    // dotted-form mapped public: must not be over-blocked
    expect(isPrivateOrReservedAddress("::ffff:93.184.216.34")).toBe(false);
    // hex-form mapped public: ::ffff:5db8:d822 = ::ffff:93.184.216.34
    expect(isPrivateOrReservedAddress("::ffff:5db8:d822")).toBe(false);
  });

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateOrReservedAddress("not-an-ip")).toBe(true);
  });
});

const publicResolver: AddressResolver = async () => [{ address: "93.184.216.34" }];
const privateResolver: AddressResolver = async () => [{ address: "10.0.0.5" }];

describe("assertPublicUrl", () => {
  it("rejects invalid url", async () => {
    const r = await assertPublicUrl("not a url", publicResolver);
    expect(r.isFailure).toBe(true);
  });

  it("rejects credentials in url", async () => {
    const r = await assertPublicUrl("https://user:pass@example.com/hook", publicResolver);
    expect(r.isFailure).toBe(true);
  });

  it("rejects a host resolving to a private ip", async () => {
    const r = await assertPublicUrl("https://sneaky.example.com/hook", privateResolver);
    expect(r.isFailure).toBe(true);
  });

  it("accepts a public https url", async () => {
    const r = await assertPublicUrl("https://example.com/hook", publicResolver);
    expect(r.isSuccess).toBe(true);
    if (r.isSuccess) expect(r.getValue().hostname).toBe("example.com");
  });
});
