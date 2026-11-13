import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { createAuth } from "../auth/create-auth";
import { fakeAuthDeps } from "./fake-auth-deps";

const STARTUP_CATALOG_READS = 1;

describe("createAuth", () => {
  it("resolves the plan catalog as often as the singleton does at startup", async () => {
    const getCatalog = mock(async () => Result.ok<never[], never>([]));
    const auth = createAuth(fakeAuthDeps({ plans: { execute: getCatalog } }));

    await auth.$context;

    expect(getCatalog).toHaveBeenCalledTimes(STARTUP_CATALOG_READS);
  });

  it("gives each instance its own catalog reads", async () => {
    const first = mock(async () => Result.ok<never[], never>([]));
    const second = mock(async () => Result.ok<never[], never>([]));
    const firstAuth = createAuth(fakeAuthDeps({ plans: { execute: first } }));
    const secondAuth = createAuth(fakeAuthDeps({ plans: { execute: second } }));

    await Promise.all([firstAuth.$context, secondAuth.$context]);

    expect(first).toHaveBeenCalledTimes(STARTUP_CATALOG_READS);
    expect(second).toHaveBeenCalledTimes(STARTUP_CATALOG_READS);
  });
});
