import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { ACTOR_ID, adminApp, MANAGER, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const AT = new Date("2026-01-02T03:04:05.000Z");

let inbox = mockPort<AdminRoutesDeps["IStaffInboxQuery"]>();
let listViews = mockPort<AdminRoutesDeps["IListSavedViewsQuery"]>();
let saveView = mockPort<AdminRoutesDeps["SaveViewUseCase"]>();
let deleteView = mockPort<AdminRoutesDeps["DeleteViewUseCase"]>();

beforeEach(() => {
  inbox = mockPort<AdminRoutesDeps["IStaffInboxQuery"]>();
  listViews = mockPort<AdminRoutesDeps["IListSavedViewsQuery"]>();
  saveView = mockPort<AdminRoutesDeps["SaveViewUseCase"]>();
  deleteView = mockPort<AdminRoutesDeps["DeleteViewUseCase"]>();
});

const app = () =>
  adminApp({
    IStaffInboxQuery: inbox,
    IListSavedViewsQuery: listViews,
    SaveViewUseCase: saveView,
    DeleteViewUseCase: deleteView,
  });

const VIEW = {
  screen: "users" as const,
  name: "Suspended",
  filters: { status: "suspended" as const },
};

describe("GET /admin/inbox", () => {
  it("shows each section as ok, failed or absent", async () => {
    inbox.execute.mockResolvedValue(
      Result.ok({
        approvals: Option.some(
          Result.ok({
            total: 1,
            items: [
              {
                id: "approval-1",
                action: "staff.revoke",
                subjectId: "u-2",
                params: {},
                requestedBy: "u-3",
                status: "pending",
                decidedBy: Option.none(),
                decisionNote: Option.none(),
                failureReason: Option.none(),
                expiresAt: AT,
                decidedAt: Option.none(),
                createdAt: AT,
                version: 1,
              },
            ],
          }),
        ),
        queues: Option.some(Result.fail({ code: "ADMIN_OPS_PROVIDER_FAILURE", message: "down" })),
        sweeps: Option.none(),
      }),
    );

    const res = await send(app(), "GET", "/admin/inbox");

    expect(res.status).toBe(200);
    expect(inbox.execute).toHaveBeenCalledWith({ permissions: MANAGER.permissions });
    expect(await res.json()).toEqual({
      approvals: {
        status: "ok",
        total: 1,
        items: [
          {
            id: "approval-1",
            action: "staff.revoke",
            requestedBy: "u-3",
            createdAt: AT.toISOString(),
          },
        ],
      },
      queues: { status: "failed" },
      sweeps: null,
    });
  });
});

describe("saved views", () => {
  it("lists the views of the current staff member", async () => {
    listViews.execute.mockResolvedValue(Result.ok([{ id: "v-1", ...VIEW }]));

    const res = await send(app(), "GET", "/admin/views");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: "v-1", ...VIEW }] });
    expect(listViews.execute).toHaveBeenCalledWith({
      ownerId: ACTOR_ID,
      permissions: MANAGER.permissions,
    });
  });

  it("saves a valid view and returns its id", async () => {
    saveView.execute.mockResolvedValue(Result.ok({ id: "v-2" }));

    const res = await send(app(), "POST", "/admin/views", VIEW);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "v-2" });
    expect(saveView.execute).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      permissions: MANAGER.permissions,
      view: VIEW,
    });
  });

  it("refuses a view of an unknown page", async () => {
    const res = await send(app(), "POST", "/admin/views", { ...VIEW, screen: "nowhere" });

    expect(res.status).toBe(400);
    expect(saveView.execute).not.toHaveBeenCalled();
  });

  it("deletes a view on behalf of the current user", async () => {
    deleteView.execute.mockResolvedValue(Result.ok());

    const res = await send(app(), "DELETE", "/admin/views/v-1");

    expect(res.status).toBe(200);
    expect(deleteView.execute).toHaveBeenCalledWith({ actorUserId: ACTOR_ID, viewId: "v-1" });
  });

  it("answers 404 for a view that is not the user's", async () => {
    deleteView.execute.mockResolvedValue(
      Result.fail({ code: "ADMIN_VIEW_NOT_FOUND", message: "no" }),
    );

    const res = await send(app(), "DELETE", "/admin/views/v-9");

    expect(res.status).toBe(404);
  });
});
