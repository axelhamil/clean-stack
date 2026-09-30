import type { SCIMIdentity, SCIMProjection } from "@better-auth/scim";
import { APIError } from "better-auth/api";
import { domainOf } from "./sso-enforcement";

export interface ScimMembershipDeps {
  seatCapFor(organizationId: string): Promise<{ available: boolean; maxMembers: number | null }>;
  isVerifiedSsoDomainOf(organizationId: string, domain: string): Promise<boolean>;
}

interface MemberRow {
  id: string;
  role: string;
}

interface UserRow {
  id: string;
  emailVerified: boolean;
}

/**
 * An RFC 7644 §3.12 error body. Every `/scim/v2/*` response an IdP parses has to
 * carry `schemas`/`status`/`detail`: Okta and Entra surface a generic "provider
 * error" for anything else, hiding the actual reason from the operator who has to
 * act on it. `@better-auth/scim` builds its own errors the same way but does not
 * export the helper, so the shape is reproduced here. An `APIError` thrown from a
 * SCIM callback reaches the directory as is (the plugin wraps anything else in a
 * 500), and it rolls the provisioning transaction back with it. `message` rides
 * along so the error is not blank in logs and telemetry.
 */
const SCIM_ERROR_STATUS = { PAYMENT_REQUIRED: 402 } as const;

export function scimError(status: keyof typeof SCIM_ERROR_STATUS, detail: string): APIError {
  return new APIError(status, {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(SCIM_ERROR_STATUS[status]),
    detail,
    message: detail,
  });
}

function holdsOwnerRole(role: string): boolean {
  return role.split(",").includes("owner");
}

/**
 * Projects a directory's lifecycle onto organization membership. `@better-auth/scim`
 * has no notion of organizations: it calls this, inside its own transaction, with
 * the complete state of one user in one provisioning domain (always an
 * organization id here), after every change that can affect it.
 *
 * - An active user gets a `member` row, provided the plan still has a seat. The
 *   refusal is a SCIM 402, and throwing it rolls the whole provisioning back, so a
 *   directory can never push an organization past its seat cap.
 * - A user who is no longer active (deactivated, deleted, or whose connection was
 *   decommissioned) loses the row, which is an org departure, never an account
 *   deletion: the user and every other membership survive.
 * - An owner is never removed. The directory does not decide who owns the
 *   organization, and an organization must keep one.
 *
 * Writes go through the transaction adapter the plugin hands over, so membership
 * commits or rolls back with the SCIM change that caused it. The events that
 * describe it are emitted after the commit, from `hooks.after` and from
 * `ScimConnectionService`, the only places that know the request succeeded.
 */
export function scimMembershipProjection(deps: ScimMembershipDeps): SCIMProjection {
  return {
    async reconcileUser({ provisioningDomainId: organizationId, userId, active }, { database }) {
      const member = await database.findOne<MemberRow>({
        model: "member",
        where: [
          { field: "organizationId", value: organizationId },
          { field: "userId", value: userId },
        ],
      });

      if (active) {
        if (member) return;

        const { available, maxMembers } = await deps.seatCapFor(organizationId);
        if (!available) {
          throw scimError("PAYMENT_REQUIRED", `Seat limit reached (${maxMembers ?? "∞"}).`);
        }

        await database.create({
          model: "member",
          data: { organizationId, userId, role: "member", createdAt: new Date() },
        });
        return;
      }

      if (!member || holdsOwnerRole(member.role)) return;

      await database.delete({ model: "member", where: [{ field: "id", value: member.id }] });
    },
  };
}

/**
 * Decides whether a provisioned identity creates a new user or takes over an
 * existing one. `@better-auth/scim` never links by email on its own: without this
 * a directory pushing someone who already signed up gets a 409.
 *
 * Linking hands the directory real power over the account (deactivating it
 * revokes every session the user has, in every organization), so it is only
 * granted when the organization proved it controls the email's domain, the proof
 * SSO already demands, and only for an address the user proved they own. The
 * profile is preserved: an organization's directory does not get to rename an
 * account it did not create. Anything else is a creation, which the plugin
 * refuses with a 409 when the address is taken.
 */
export function scimIdentityResolver(deps: ScimMembershipDeps): SCIMIdentity {
  return {
    async resolveUser({ provisioningDomainId: organizationId, resource }, { database }) {
      const email = resource.primaryEmail.toLowerCase();
      const domain = domainOf(email);
      if (!domain) return { action: "create" };

      const existing = await database.findOne<UserRow>({
        model: "user",
        where: [{ field: "email", value: email }],
      });
      if (!existing?.emailVerified) return { action: "create" };

      const trusted = await deps.isVerifiedSsoDomainOf(organizationId, domain);
      if (!trusted) return { action: "create" };

      return { action: "link", userId: existing.id, profile: "preserve" };
    },
  };
}
