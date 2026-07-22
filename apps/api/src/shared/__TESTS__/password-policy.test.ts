import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { findPasswordViolation, validatePassword } from "../password-policy";
import type { IPasswordBreachService } from "../ports/password-breach.port";

describe("findPasswordViolation", () => {
  const ctx = { email: "alice@example.com", name: "Alice Dupont", appName: "clean-stack" };

  it("retourne un objet avec message et isBreach:false si le password contient l'email local-part", () => {
    const result = findPasswordViolation("alice@supersecret!", ctx);
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(false);
  });

  it("ne bloque pas si l'email local-part est < 3 chars", () => {
    const shortEmailCtx = { email: "ab@example.com", name: "Bob", appName: "clean-stack" };
    expect(findPasswordViolation("abXYZ1234567890!", shortEmailCtx)).toBeNull();
  });

  it("retourne un objet avec message et isBreach:false si le password contient le name", () => {
    const result = findPasswordViolation("alice-dupont-rule2025", ctx);
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(false);
  });

  it("ne bloque pas si le name est < 3 chars", () => {
    const shortNameCtx = { email: "user@example.com", name: "Al", appName: "clean-stack" };
    expect(findPasswordViolation("AlZXY1234567890!", shortNameCtx)).toBeNull();
  });

  it("retourne un objet avec message et isBreach:false si le password contient le token app (sans tiret)", () => {
    const result = findPasswordViolation("cleanstack2025!xyz", ctx);
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(false);
  });

  it("retourne null pour un password fort et inédit", () => {
    expect(findPasswordViolation("Zr!9xK#mP2@qLn8w", ctx)).toBeNull();
  });

  it("la comparaison est case-insensitive", () => {
    const result = findPasswordViolation("ALICE@example.com!!!", ctx);
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(false);
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

  it("ne contacte pas HIBP et passe quand le password est plus court que le minimum", async () => {
    let called = false;
    const spy: IPasswordBreachService = {
      isBreached: async () => {
        called = true;
        return Result.ok(true);
      },
    };
    expect(await validatePassword("short", ctx, spy)).toBeNull();
    expect(called).toBe(false);
  });

  it("retourne la violation contextuelle (isBreach:false) avant même le check breach", async () => {
    const result = await validatePassword("alice-secret-1234567", ctx, breachWith(false));
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(false);
    expect(typeof result?.message).toBe("string");
  });

  it("retourne isBreach:true quand HIBP signale un breach", async () => {
    const result = await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachWith(true));
    expect(result).not.toBeNull();
    expect(result?.isBreach).toBe(true);
    expect(typeof result?.message).toBe("string");
  });

  it("passe (null) pour un password fort inédit non-breaché", async () => {
    expect(await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachWith(false))).toBeNull();
  });

  it("fail-open : laisse passer quand HIBP est injoignable", async () => {
    expect(await validatePassword("Zr!9xK#mP2@qLn8w", ctx, breachFails)).toBeNull();
  });
});
