import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { payloadParser } from "../payload-parser";

const parse = payloadParser(z.object({ user: z.object({ id: z.string() }) }));

describe("payloadParser", () => {
  it("returns the parsed payload when it matches the schema", () => {
    const result = parse({ user: { id: "u1" } });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ user: { id: "u1" } });
  });

  it("names the nested path and the issue code of a mismatch", () => {
    const result = parse({ user: { id: 42 } });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("user.id: invalid_type");
  });

  it("names the root when the payload itself is wrong", () => {
    const result = parse("not an object");

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("(root): invalid_type");
  });
});
