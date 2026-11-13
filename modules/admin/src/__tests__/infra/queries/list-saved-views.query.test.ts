import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { ISavedViewStore } from "../../../application/ports/repositories/saved-view-store.port";
import { SavedViewListQuery } from "../../../infra/queries/list-saved-views.query";

describe("SavedViewListQuery", () => {
  it("reads only the screens the permissions open", async () => {
    const store = mockPort<ISavedViewStore>();
    store.list.mockImplementation(async () => Result.ok([]));

    await new SavedViewListQuery(store, mockInstrumentation()).execute({
      ownerId: "staff-1",
      permissions: ["audit.read"],
    });

    expect(store.list.mock.calls[0]?.[1]).toEqual(["audit"]);
  });
});
