import { describe, expect, it } from "bun:test";
import { COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type {
  ConsentRecord,
  IConsentRepository,
} from "../../../application/ports/repositories/consent.port";
import { LedgerActiveConsentQuery } from "../../../infra/queries/get-active-consent.query";

function record(id: string): ConsentRecord {
  return {
    id,
    subjectId: "subj-1",
    userId: Option.none(),
    categories: ["necessary"],
    policyVersion: COOKIE_CONSENT_VERSION,
    grantedAt: new Date("2026-01-01"),
    withdrawnAt: Option.none(),
    expiresAt: new Date("2027-01-01"),
    ipAddress: Option.none(),
    userAgent: Option.none(),
  };
}

function given(byUser: Option<ConsentRecord>, bySubject: Option<ConsentRecord>) {
  const repository = mockPort<IConsentRepository>();
  repository.findActiveByUser.mockResolvedValue(Result.ok(byUser));
  repository.findActiveBySubject.mockResolvedValue(Result.ok(bySubject));

  return { repository, query: new LedgerActiveConsentQuery(repository) };
}

describe("active consent of a browser", () => {
  it("prefers the consent of the signed-in account over the browser's", async () => {
    const { query } = given(Option.some(record("account")), Option.some(record("browser")));

    const result = await query.execute({ subjectId: "subj-1", userId: Option.some("u1") });

    expect(result.getValue().map((found) => found.id)).toEqual(Option.some("account"));
  });

  it("falls back to the browser's consent when the account has none", async () => {
    const { query } = given(Option.none(), Option.some(record("browser")));

    const result = await query.execute({ subjectId: "subj-1", userId: Option.some("u1") });

    expect(result.getValue().map((found) => found.id)).toEqual(Option.some("browser"));
  });

  it("reads only the browser's consent for a visitor", async () => {
    const { repository, query } = given(Option.some(record("account")), Option.none());

    const result = await query.execute({ subjectId: "subj-1", userId: Option.none() });

    expect(result.getValue().isNone()).toBe(true);
    expect(repository.findActiveByUser).not.toHaveBeenCalled();
  });
});
