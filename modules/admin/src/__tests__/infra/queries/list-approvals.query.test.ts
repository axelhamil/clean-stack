import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { IApprovalStore } from "../../../application/ports/repositories/approval-store.port";
import { ApprovalListQuery } from "../../../infra/queries/list-approvals.query";
import { PENDING } from "../../fixtures/approval-setup";

describe("ApprovalListQuery", () => {
  it("offers a cursor on a full page that carries both keys, none on a short one", async () => {
    const store = mockPort<IApprovalStore>();
    store.list.mockImplementation(async () => Result.ok([PENDING]));
    const query = new ApprovalListQuery(store, mockInstrumentation());

    const full = await query.execute({ limit: 1 });
    const short = await query.execute({ limit: 2 });

    expect(full.getValue().nextCursor.unwrap()).toBe(`${PENDING.createdAt.toISOString()}~a1`);
    expect(short.getValue().nextCursor.isNone()).toBe(true);
  });
});
