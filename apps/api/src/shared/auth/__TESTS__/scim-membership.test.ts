import { describe, expect, it } from "bun:test";
import type { SCIMCanonicalUser, SCIMTransactionContext } from "@better-auth/scim";
import { APIError } from "better-auth/api";
import {
  type ScimMembershipDeps,
  scimIdentityResolver,
  scimMembershipProjection,
} from "../scim-membership";

interface Row {
  [field: string]: unknown;
}

interface FakeDatabase {
  rows: Record<string, Row[]>;
  created: { model: string; data: Row }[];
  deleted: { model: string; id: unknown }[];
  context: SCIMTransactionContext;
}

function fakeDatabase(rows: Record<string, Row[]>): FakeDatabase {
  const created: FakeDatabase["created"] = [];
  const deleted: FakeDatabase["deleted"] = [];
  const matches = (row: Row, where: { field: string; value: unknown }[]) =>
    where.every(({ field, value }) => row[field] === value);

  const database = {
    async findOne({ model, where }: { model: string; where: { field: string; value: unknown }[] }) {
      return (rows[model] ?? []).find((row) => matches(row, where)) ?? null;
    },
    async create({ model, data }: { model: string; data: Row }) {
      created.push({ model, data });
      return data;
    },
    async delete({ model, where }: { model: string; where: { field: string; value: unknown }[] }) {
      deleted.push({ model, id: where[0]?.value });
    },
  };

  return {
    rows,
    created,
    deleted,
    context: { database } as unknown as SCIMTransactionContext,
  };
}

function deps(overrides: Partial<ScimMembershipDeps> = {}): ScimMembershipDeps {
  return {
    seatCapFor: async () => ({ available: true, maxMembers: null }),
    isVerifiedSsoDomainOf: async () => true,
    ...overrides,
  };
}

const state = (active: boolean) => ({
  provisioningDomainId: "org-1",
  userId: "user-1",
  active,
  sources: [],
  grants: [],
});

describe("scimMembershipProjection", () => {
  it("adds an active user as a member when a seat is free", async () => {
    const db = fakeDatabase({});

    await scimMembershipProjection(deps()).reconcileUser(state(true), db.context);

    expect(db.created).toHaveLength(1);
    expect(db.created[0]?.data).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      role: "member",
    });
  });

  it("leaves an existing membership untouched", async () => {
    const db = fakeDatabase({
      member: [{ id: "m-1", organizationId: "org-1", userId: "user-1", role: "admin" }],
    });

    await scimMembershipProjection(deps()).reconcileUser(state(true), db.context);

    expect(db.created).toHaveLength(0);
    expect(db.deleted).toHaveLength(0);
  });

  it("refuses with a SCIM 402 when the plan has no seat left", async () => {
    const db = fakeDatabase({});
    const full = deps({ seatCapFor: async () => ({ available: false, maxMembers: 5 }) });

    const error = await Promise.resolve(
      scimMembershipProjection(full).reconcileUser(state(true), db.context),
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).body).toMatchObject({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "402",
    });
    expect(db.created).toHaveLength(0);
  });

  it("removes the membership of a user who is no longer active", async () => {
    const db = fakeDatabase({
      member: [{ id: "m-1", organizationId: "org-1", userId: "user-1", role: "member" }],
    });

    await scimMembershipProjection(deps()).reconcileUser(state(false), db.context);

    expect(db.deleted).toEqual([{ model: "member", id: "m-1" }]);
  });

  it("never removes an owner", async () => {
    const db = fakeDatabase({
      member: [{ id: "m-1", organizationId: "org-1", userId: "user-1", role: "admin,owner" }],
    });

    await scimMembershipProjection(deps()).reconcileUser(state(false), db.context);

    expect(db.deleted).toHaveLength(0);
  });
});

describe("scimIdentityResolver", () => {
  const input = (email: string) => ({
    connectionId: "conn-1",
    provisioningDomainId: "org-1",
    resource: { primaryEmail: email } as SCIMCanonicalUser,
  });
  const existing = (emailVerified: boolean) =>
    fakeDatabase({ user: [{ id: "user-1", email: "jane@acme.com", emailVerified }] });

  it("links a verified account on a verified SSO domain, keeping its profile", async () => {
    const decision = await scimIdentityResolver(deps()).resolveUser?.(
      input("Jane@ACME.com"),
      existing(true).context,
    );

    expect(decision).toEqual({ action: "link", userId: "user-1", profile: "preserve" });
  });

  it("creates when the existing address was never verified", async () => {
    const decision = await scimIdentityResolver(deps()).resolveUser?.(
      input("jane@acme.com"),
      existing(false).context,
    );

    expect(decision).toEqual({ action: "create" });
  });

  it("creates when the organization does not own the domain", async () => {
    const untrusted = deps({ isVerifiedSsoDomainOf: async () => false });
    const decision = await scimIdentityResolver(untrusted).resolveUser?.(
      input("jane@acme.com"),
      existing(true).context,
    );

    expect(decision).toEqual({ action: "create" });
  });

  it("creates when no account holds the address", async () => {
    const decision = await scimIdentityResolver(deps()).resolveUser?.(
      input("new@acme.com"),
      existing(true).context,
    );

    expect(decision).toEqual({ action: "create" });
  });
});
