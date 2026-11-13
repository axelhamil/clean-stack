import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { AdminOrgDetail } from "../../../application/services/admin-query.service";
import { ACTOR_ID, adminApp, send, staffGuards } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const CREATED = new Date("2026-01-02T03:04:05.000Z");
const NEXT_MONTH = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

const ORG: AdminOrgDetail = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  memberCount: 2,
  createdAt: CREATED,
  ssoEnforced: false,
  members: [{ userId: "u-1", email: "u-1@example.com", role: "owner" }],
  plan: "pro",
  planOverride: Option.some({
    id: "po-1",
    organizationId: "org-1",
    tier: "pro",
    note: "deal",
    expiresAt: CREATED,
    createdAt: CREATED,
  }),
};

let queries = mockPort<AdminRoutesDeps["AdminQueryService"]>();
let overrides = mockPort<AdminRoutesDeps["PlanOverrideService"]>();
let notes = mockPort<AdminRoutesDeps["StaffNoteService"]>();
let sso = mockPort<AdminRoutesDeps["AdminActionService"]>();
let stepUps = 0;

beforeEach(() => {
  queries = mockPort<AdminRoutesDeps["AdminQueryService"]>();
  overrides = mockPort<AdminRoutesDeps["PlanOverrideService"]>();
  notes = mockPort<AdminRoutesDeps["StaffNoteService"]>();
  sso = mockPort<AdminRoutesDeps["AdminActionService"]>();
  stepUps = 0;
  overrides.set.mockResolvedValue(Result.ok());
  overrides.revoke.mockResolvedValue(Result.ok());
  sso.setSsoEnforcement.mockResolvedValue(Result.ok());
});

const app = () =>
  adminApp({
    AdminQueryService: queries,
    PlanOverrideService: overrides,
    StaffNoteService: notes,
    AdminActionService: sso,
  });

const countingStepUp = () =>
  adminApp(
    { AdminActionService: sso },
    staffGuards({
      assertStepUp: async () => {
        stepUps += 1;
      },
    }),
  );

describe("GET /admin/orgs", () => {
  it("lists organisations without their cursor field", async () => {
    queries.listOrgs.mockResolvedValue(
      Result.ok({
        items: [
          {
            id: "org-1",
            name: "Acme",
            slug: "acme",
            memberCount: 2,
            createdAt: CREATED,
            ssoEnforced: false,
            cursorAt: "2026-01-02 03:04:05",
          },
        ],
        nextCursor: Option.none(),
      }),
    );

    const res = await send(app(), "GET", "/admin/orgs");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        {
          id: "org-1",
          name: "Acme",
          slug: "acme",
          memberCount: 2,
          createdAt: CREATED.toISOString(),
          ssoEnforced: false,
        },
      ],
      nextCursor: null,
    });
  });
});

describe("GET /admin/orgs/:id", () => {
  it("answers 404 for an unknown organisation", async () => {
    queries.getOrg.mockResolvedValue(Result.ok(Option.none()));

    const res = await send(app(), "GET", "/admin/orgs/ghost");

    expect(res.status).toBe(404);
  });

  it("returns the organisation with its active plan override", async () => {
    queries.getOrg.mockResolvedValue(Result.ok(Option.some(ORG)));

    const res = await send(app(), "GET", "/admin/orgs/org-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      members: ORG.members,
      planOverride: { tier: "pro", note: "deal", expiresAt: CREATED.toISOString() },
    });
  });
});

describe("plan override", () => {
  it("sets an override with its expiry as a date", async () => {
    const res = await send(app(), "POST", "/admin/orgs/org-1/plan-override", {
      tier: "pro",
      expiresAt: NEXT_MONTH,
      note: "deal",
    });

    expect(res.status).toBe(200);
    expect(overrides.set).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      organizationId: "org-1",
      tier: "pro",
      expiresAt: new Date(NEXT_MONTH),
      note: "deal",
    });
  });

  it("refuses an expiry in the past", async () => {
    const res = await send(app(), "POST", "/admin/orgs/org-1/plan-override", {
      tier: "pro",
      expiresAt: "2000-01-01T00:00:00.000Z",
      note: "deal",
    });

    expect(res.status).toBe(400);
    expect(overrides.set).not.toHaveBeenCalled();
  });

  it("revokes the override of the organisation", async () => {
    const res = await send(app(), "DELETE", "/admin/orgs/org-1/plan-override");

    expect(res.status).toBe(200);
    expect(overrides.revoke).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      organizationId: "org-1",
    });
  });
});

describe("staff notes on an organisation", () => {
  it("lists and adds notes on the org subject", async () => {
    notes.list.mockResolvedValue(Result.ok([]));
    notes.add.mockResolvedValue(Result.ok());

    const listed = await send(app(), "GET", "/admin/orgs/org-1/notes");
    const added = await send(app(), "POST", "/admin/orgs/org-1/notes", { body: "call back" });

    expect(listed.status).toBe(200);
    expect(notes.list).toHaveBeenCalledWith({ type: "org", id: "org-1" });
    expect(added.status).toBe(200);
    expect(notes.add).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      subject: { type: "org", id: "org-1" },
      body: "call back",
    });
  });
});

describe("POST /admin/orgs/:id/sso-enforcement", () => {
  it("turns enforcement on without a step-up, through the host action, as a platform admin", async () => {
    const res = await send(countingStepUp(), "POST", "/admin/orgs/org-1/sso-enforcement", {
      enforced: true,
    });

    expect(res.status).toBe(200);
    expect(stepUps).toBe(0);
    expect(sso.setSsoEnforcement).toHaveBeenCalledWith({
      organizationId: "org-1",
      enforced: true,
      actorUserId: ACTOR_ID,
      viaPlatformAdmin: true,
    });
  });

  it("asks for a step-up before turning enforcement off", async () => {
    const res = await send(countingStepUp(), "POST", "/admin/orgs/org-1/sso-enforcement", {
      enforced: false,
    });

    expect(res.status).toBe(200);
    expect(stepUps).toBe(1);
  });
});
