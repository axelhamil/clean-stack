import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { ApiTokenError, IApiTokenRepository } from "../../../shared/ports/api-token.port";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { revokeTokensOnMembershipLost } from "../application/event-handlers/revoke-on-membership-lost";

function makeRepo(revoked: Result<string[], ApiTokenError> = Result.ok([])) {
  const repo = mockPort<IApiTokenRepository>();
  repo.revokeAllForMembership.mockResolvedValue(revoked);
  return repo;
}

function makeOutbox() {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockResolvedValue(undefined);
  return outbox;
}

function makeDeps(repo: PortMock<IApiTokenRepository>, outbox = makeOutbox()) {
  return {
    IApiTokenRepository: repo,
    IOutboxRepository: outbox,
    ITransactionService: mockUnitOfWork().unitOfWork,
  };
}

function makeOrgMemberRemovedEvent(payload: object) {
  return {
    eventId: "evt-1",
    eventType: EventTypes.ORG_MEMBER_REMOVED,
    aggregateType: "organization",
    aggregateId: "org-1",
    payload,
    dateOccurred: new Date(),
    version: 1,
  };
}

describe("revokeTokensOnMembershipLost", () => {
  it("revokes tokens of the removed member in the target org and emits one event per token", async () => {
    const tokenIds = ["tok-a", "tok-b"];
    const repo = makeRepo(Result.ok(tokenIds));
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(repo.revokeAllForMembership).toHaveBeenCalledWith("user-1", "org-1");
    expect(enqueuedEvents(outbox)).toEqual(
      tokenIds.map((tokenId) => ({
        eventType: EventTypes.API_TOKEN_REVOKED,
        aggregateId: tokenId,
        payload: {
          userId: "user-1",
          actorUserId: "admin-1",
          organizationId: "org-1",
          tokenId,
          reason: "membership_lost",
        },
      })),
    );
  });

  it("does not emit any event when no tokens are revoked", async () => {
    const repo = makeRepo();
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("does not revoke tokens from a different organization", async () => {
    const repo = makeRepo();
    repo.revokeAllForMembership.mockImplementation(async (_userId, organizationId) =>
      Result.ok(organizationId === "org-other" ? ["tok-x"] : []),
    );
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(repo.revokeAllForMembership).toHaveBeenCalledWith("user-1", "org-1");
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("given a repository failure, when handled, then it throws so the delivery is retried", async () => {
    const repo = makeRepo(Result.fail({ code: "API_TOKEN_PROVIDER_FAILURE", message: "db error" }));
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await expect(
      handler.handle(
        makeOrgMemberRemovedEvent({
          organizationId: "org-1",
          userId: "user-1",
          actorUserId: "admin-1",
        }),
      ),
    ).rejects.toThrow("API_TOKEN_PROVIDER_FAILURE");

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("silently ignores events with an invalid payload", async () => {
    const repo = makeRepo();
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(makeOrgMemberRemovedEvent({ garbage: true }));

    expect(repo.revokeAllForMembership).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
