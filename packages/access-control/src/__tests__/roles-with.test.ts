import { describe, expect, test } from "vitest";
import { rolesWith } from "../index";

describe("rolesWith", () => {
  test("grants billing:read to owner and admin", () => {
    expect(rolesWith({ billing: ["read"] }).sort()).toEqual(["admin", "owner"]);
  });

  test("grants billing:manage to owner only", () => {
    expect(rolesWith({ billing: ["manage"] })).toEqual(["owner"]);
  });

  test("grants scim:manage to owner only", () => {
    expect(rolesWith({ scim: ["manage"] })).toEqual(["owner"]);
  });

  test("withholds organization:update from member", () => {
    expect(rolesWith({ organization: ["update"] })).not.toContain("member");
  });

  test("requires every requested capability", () => {
    expect(rolesWith({ billing: ["read", "manage"], apiToken: ["revoke"] })).toEqual(["owner"]);
  });
});
