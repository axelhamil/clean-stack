import { describe, expect, test } from "vitest";
import { rolesWith } from "../index";

describe("rolesWith", () => {
  test("billing:read couvre owner et admin", () => {
    expect(rolesWith({ billing: ["read"] }).sort()).toEqual(["admin", "owner"]);
  });

  test("billing:manage ne couvre que owner", () => {
    expect(rolesWith({ billing: ["manage"] })).toEqual(["owner"]);
  });

  test("organization:update couvre owner et admin, pas member", () => {
    expect(rolesWith({ organization: ["update"] })).not.toContain("member");
  });

  test("une capability inconnue de tous ne renvoie aucun role", () => {
    expect(rolesWith({ billing: ["read", "manage"], apiToken: ["revoke"] })).toEqual(["owner"]);
  });
});
