import { ac, isPersonalOrg, roles } from "@packages/access-control";
import { EventTypes } from "@packages/events";
import { organization } from "better-auth/plugins";
import type { AuthDeps } from "../deps";
import { localeOf, tokenIdempotencyKey } from "../email";
import type { AuthHelpers } from "../helpers";
import { organizationSeatGate } from "../organization-seats";
import { deleteOrgIfEmpty } from "../queries";

export function organizationPlugin(
  deps: Pick<AuthDeps, "uow" | "settings">,
  helpers: Pick<AuthHelpers, "emit" | "dispatchEmail" | "seatCapFor">,
) {
  const { emit, dispatchEmail } = helpers;
  const assertSeatAvailableFor = organizationSeatGate(helpers.seatCapFor);

  return organization({
    ac,
    roles,
    creatorRole: "owner",
    schema: {
      organization: {
        additionalFields: {
          ssoEnforced: { type: "boolean", required: false, returned: true, input: false },
        },
      },
    },
    organizationHooks: {
      beforeAddMember: async ({ organization: org }) => {
        await assertSeatAvailableFor(org.id);
      },
      // Gate the invite-create path so operators get early feedback when the
      // org is already at cap (nice-to-have UX, not the authoritative gate).
      beforeCreateInvitation: async ({ organization: org }) => {
        await assertSeatAvailableFor(org.id);
      },
      // Authoritative gate for the invite→accept path. `beforeAddMember` does
      // NOT fire on invitation acceptance (§6 two-path trap documented above).
      beforeAcceptInvitation: async ({ organization: org }) => {
        await assertSeatAvailableFor(org.id);
      },
      beforeDeleteOrganization: async ({ organization: org }) => {
        if (isPersonalOrg(org.slug)) {
          throw new Error("Personal organization cannot be deleted. Delete your account instead.");
        }
      },
      afterCreateOrganization: async ({ organization: org, member }) => {
        if (isPersonalOrg(org.slug)) return;
        await emit(
          EventTypes.ORG_CREATED,
          "organization",
          org.id,
          {
            organizationId: org.id,
            ownerUserId: member.userId,
            slug: org.slug,
            name: org.name,
          },
          org.id,
        );
      },
      afterUpdateOrganization: async ({ organization: org, user }) => {
        if (!org) return;
        await emit(
          EventTypes.ORG_UPDATED,
          "organization",
          org.id,
          {
            organizationId: org.id,
            actorUserId: user.id,
            changes: { name: org.name, slug: org.slug, logo: org.logo },
          },
          org.id,
        );
      },
      afterDeleteOrganization: async ({ organization: org, user }) => {
        if (isPersonalOrg(org.slug)) return;
        await emit(
          EventTypes.ORG_DELETED,
          "organization",
          org.id,
          { organizationId: org.id, actorUserId: user.id },
          org.id,
        );
      },
      afterAddMember: async ({ member, user, organization: org }) => {
        await emit(
          EventTypes.ORG_MEMBER_JOINED,
          "member",
          member.id,
          {
            organizationId: org.id,
            userId: member.userId,
            role: member.role,
            actorUserId: user.id !== member.userId ? user.id : undefined,
          },
          org.id,
        );
      },
      afterRemoveMember: async ({ member, user, organization: org }) => {
        // SCIM deprovisioning never reaches this hook: the SCIM projection removes
        // the member row itself and `hooks.after` emits for it, with the
        // connection owner as the actor.
        const actorUserId = user.id;
        await emit(
          EventTypes.ORG_MEMBER_REMOVED,
          "member",
          member.id,
          { organizationId: org.id, actorUserId, userId: member.userId },
          org.id,
        );
        if (isPersonalOrg(org.slug)) return;
        await deps.uow.run(async () => {
          const deleted = await deleteOrgIfEmpty(org.id);
          if (!deleted) return;
          await emit(
            EventTypes.ORG_DELETED,
            "organization",
            org.id,
            { organizationId: org.id, actorUserId },
            org.id,
          );
        });
      },
      afterUpdateMemberRole: async ({ member, previousRole, user, organization: org }) => {
        await emit(
          EventTypes.ORG_MEMBER_ROLE_CHANGED,
          "member",
          member.id,
          {
            organizationId: org.id,
            actorUserId: user.id,
            userId: member.userId,
            previousRole,
            newRole: member.role,
          },
          org.id,
        );
      },
      afterCreateInvitation: async ({ invitation, organization: org }) => {
        await emit(
          EventTypes.ORG_MEMBER_INVITED,
          "invitation",
          invitation.id,
          {
            organizationId: org.id,
            invitationId: invitation.id,
            email: invitation.email,
            role: invitation.role ?? "member",
            inviterUserId: invitation.inviterId,
          },
          org.id,
        );
      },
      afterCancelInvitation: async ({ invitation, cancelledBy, organization: org }) => {
        await emit(
          EventTypes.ORG_INVITATION_CANCELLED,
          "invitation",
          invitation.id,
          {
            organizationId: org.id,
            actorUserId: cancelledBy.id,
            invitationId: invitation.id,
          },
          org.id,
        );
      },
      // `afterAddMember` only fires for direct adds (org-create creator, signup auto-personal-org).
      // BetterAuth routes invitation acceptance through `afterAcceptInvitation`, without this,
      // every member who joins via invite would be invisible to the outbox.
      afterAcceptInvitation: async ({ member, organization: org }) => {
        await emit(
          EventTypes.ORG_MEMBER_JOINED,
          "member",
          member.id,
          {
            organizationId: org.id,
            userId: member.userId,
            role: member.role,
          },
          org.id,
        );
      },
    },
    sendInvitationEmail: async ({ id, email, role, inviter, organization: org }) => {
      const inviteUrl = `${deps.settings.appUrl}/accept-invitation/${id}`;
      // Rendered in the inviter's locale, not the invitee's: an invitee with
      // no account yet has no locale of their own to read.
      await dispatchEmail(
        "org_invitation",
        email,
        {
          inviterName: inviter.user.name ?? inviter.user.email,
          orgName: org.name,
          role,
          inviteUrl,
        },
        tokenIdempotencyKey("org-invitation", id),
        localeOf(inviter.user),
      );
    },
  });
}
