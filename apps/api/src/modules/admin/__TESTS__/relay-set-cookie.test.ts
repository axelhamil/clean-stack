import { describe, expect, it } from "bun:test";
import { relaySetCookie } from "../relay-set-cookie";

describe("relaySetCookie", () => {
  it("copies every set-cookie header from the source response", () => {
    const from = new Response(null);
    from.headers.append("set-cookie", "session=abc; Path=/; HttpOnly");
    from.headers.append("set-cookie", "admin_session=def; Path=/; HttpOnly");
    const to = new Response(JSON.stringify({ ok: true }));

    const result = relaySetCookie(from, to);

    expect(result.headers.getSetCookie()).toEqual([
      "session=abc; Path=/; HttpOnly",
      "admin_session=def; Path=/; HttpOnly",
    ]);
  });

  it("leaves the target untouched when the source sets no cookie", () => {
    const to = new Response(JSON.stringify({ ok: true }));
    const result = relaySetCookie(new Response(null), to);
    expect(result.headers.getSetCookie()).toEqual([]);
  });
});
