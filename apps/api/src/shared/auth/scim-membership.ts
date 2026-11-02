import type { SCIMIdentity, SCIMProjection } from "@better-auth/scim";
import { APIError } from "better-auth/api";
import { domainOf } from "./sso-enforcement";

export interface ScimMembershipDeps {
  seatCapFor(organizationId: string): Promise<{ available: boolean; maxMembers: number | null }>;
  isVerifiedSsoDomainOf(organizationId: string, domain: string): Promise<boolean>;
  hasSsoEntitlement(organizationId: string): Promise<boolean>;
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
 * along so the error is not blank in logs and telemetry, and `code` is the stable
 * identifier a client can branch on.
 */
const SCIM_ERROR_STATUS = { PAYMENT_REQUIRED: 402, FORBIDDEN: 403 } as const;

export type ScimErrorCode =
  | "SCIM_SEAT_LIMIT_REACHED"
  | "SCIM_PLAN_REQUIRED"
  | "SCIM_DOMAIN_NOT_VERIFIED";

export function scimError(
  status: keyof typeof SCIM_ERROR_STATUS,
  code: ScimErrorCode,
  detail: string,
): APIError {
  return new APIError(status, {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(SCIM_ERROR_STATUS[status]),
    detail,
    code,
    message: detail,
  });
}

function planRequired(): APIError {
  return scimError(
    "FORBIDDEN",
    "SCIM_PLAN_REQUIRED",
    "This organization's plan no longer includes directory provisioning. Users can still be deactivated or removed; upgrade the plan to add new ones.",
  );
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
 * - An active user gets a `member` row, provided the plan still includes SSO and has
 *   a seat. The refusals are a SCIM 403 and 402, and throwing them rolls the whole
 *   provisioning back, so a directory can never push an organization past its plan.
 *   The seat count runs on the plugin's transaction behind a per-organization lock
 *   (`seatCapFor`), so concurrent provisionings take the last seat once.
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
        if (!(await deps.hasSsoEntitlement(organizationId))) throw planRequired();

        const { available, maxMembers } = await deps.seatCapFor(organizationId);
        if (!available) {
          throw scimError(
            "PAYMENT_REQUIRED",
            "SCIM_SEAT_LIMIT_REACHED",
            `Seat limit reached (${maxMembers ?? "∞"}). Free a seat or upgrade the plan, then retry the provisioning.`,
          );
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
 * A directory only ever provisions addresses on a domain the organization proved
 * it controls, the proof SSO already demands. Anything else is refused: creating
 * the account would let any organization reserve someone else's address
 * (`ceo@competitor.com`) before its owner signs up.
 *
 * Linking hands the directory real power over the account (deactivating it
 * revokes every session the user has, in every organization), so on top of the
 * domain it requires an address the user proved they own. The profile is
 * preserved: an organization's directory does not get to rename an account it did
 * not create. An unverified address on a verified domain is a creation, which the
 * plugin refuses with a 409 because the address is taken.
 */
export function scimIdentityResolver(deps: ScimMembershipDeps): SCIMIdentity {
  return {
    async resolveUser({ provisioningDomainId: organizationId, resource }, { database }) {
      const email = resource.primaryEmail.toLowerCase();
      const domain = domainOf(email);
      const trusted = domain !== null && (await deps.isVerifiedSsoDomainOf(organizationId, domain));
      if (!trusted) {
        throw scimError(
          "FORBIDDEN",
          "SCIM_DOMAIN_NOT_VERIFIED",
          `${email} is not on a domain this organization has verified for SSO. Verify the domain in the SSO settings, then retry the provisioning.`,
        );
      }
      if (!(await deps.hasSsoEntitlement(organizationId))) throw planRequired();

      const existing = await database.findOne<UserRow>({
        model: "user",
        where: [{ field: "email", value: email }],
      });
      if (!existing?.emailVerified) return { action: "create" };

      return { action: "link", userId: existing.id, profile: "preserve" };
    },
  };
}
