import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { findPasswordViolation, validatePassword } from "../password-policy";
import type { IPasswordBreachService } from "../ports/password-breach.port";

describe("findPasswordViolation", () => {
  const ctx = { email: "alice@example.com", name: "Alice Dupont", appName: "clean-stack" };

  it("returns a message with isBreach:false when the password contains the email local part", () => {
    const result = findPasswordViolation("alice@supersecret!", ctx);
    expect(result.unwrap().isBreach).toBe(false);
  });

  it("does not block when the email local part is shorter than 3 chars", () => {
    const shortEmailCtx = { email: "ab@example.com", name: "Bob", appName: "clean-stack" };
    expect(findPasswordViolation("abXYZ1234567890!", shortEmailCtx).isNone()).toBe(true);
  });

  it("returns a message with isBreach:false when the password contains the name", () => {
    const result = findPasswordViolation("alice-dupont-rule2025", ctx);
    expect(result.unwrap().isBreach).toBe(false);
  });

  it("does not block when the name is shorter than 3 chars", () => {
    const shortNameCtx = { email: "user@example.com", name: "Al", appName: "clean-stack" };
    expect(findPasswordViolation("AlZXY1234567890!", shortNameCtx).isNone()).toBe(true);
  });

  it("returns a message with isBreach:false when the password contains the app token (without hyphens)", () => {
    const result = findPasswordViolation("cleanstack2025!xyz", ctx);
    expect(result.unwrap().isBreach).toBe(false);
  });

  it("returns none for a strong, unseen password", () => {
    expect(findPasswordViolation("Zr!9xK#mP2@qLn8w", ctx).isNone()).toBe(true);
  });

  it("compares case-insensitively", () => {
    const result = findPasswordViolation("ALICE@example.com!!!", ctx);
    expect(result.unwrap().isBreach).toBe(false);
  });
});

describe("validatePassword", () => {
  const ctx = { email: "alice@example.com", name: "Alice Dupont", appName: "clean-stack" };
  const breachWith = (breached: boolean): IPasswordBreachService => ({
    isBreached: async () => Result.ok(breached),
  });
  const breachFails: IPasswordBreachService = {
    isBreached: async () => Result.fail({ code: "BREACH_CHECK_PROVIDER_FAILURE", message: "down" }),
  };

  it("skips HIBP and passes when the password is below the minimum length", async () => {
    let called = false;
    const spy: IPasswordBreachService = {
      isBreached: async () => {
        called = true;
        return Result.ok(true);
      },
    };
    expect((await validatePassword("short", ctx, spy)).isNone()).toBe(true);
    expect(called).toBe(false);
  });

  it("returns the contextual violation (isBreach:false) before any breach check", async () => {
    const result = await validatePassword("alice-secret-1234567", ctx, breachWith(false));
    expect(result.unwrap().isBreach).toBe(false);
    expect(typeof result.unwrap().message).toBe("string");
  });

  it("returns isBreach:true when HIBP reports a breach", async () => {
    const result = await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachWith(true));
    expect(result.unwrap().isBreach).toBe(true);
    expect(typeof result.unwrap().message).toBe("string");
  });

  it("passes (none) for a strong password absent from breaches", async () => {
    expect((await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachWith(false))).isNone()).toBe(
      true,
    );
  });

  it("fails open when HIBP is unreachable", async () => {
    expect((await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachFails)).isNone()).toBe(true);
  });
});
