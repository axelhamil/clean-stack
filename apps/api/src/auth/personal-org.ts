import { lockForTransaction } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { di } from "../container";
import { emit } from "./emit";
import { findActiveMemberOrgId, insertPersonalOrgWithOwner } from "./queries";

interface SignupUser {
  email: string;
  name: string;
}

/**
 * Idempotent bootstrap that guarantees every user has exactly one Personal org
 * and is its owner. Runs at signup (`databaseHooks.user.create.after`) and at
 * every sign-in (`databaseHooks.session.create.before`) to back-fill users who
 * pre-date the org model. A Postgres advisory lock on `userId` prevents the
 * double-insert race that would arise if two concurrent sessions trigger this
 * for the same new user. Inside a BetterAuth transaction (SSO sign-in creates the
 * user and its session in one) it runs on that transaction: on another connection
 * the `member` insert would reference a user that is not committed yet.
 */
export async function ensurePersonalOrgFor(
  userId: string,
  signupUser?: SignupUser,
): Promise<string> {
  return di.ITransactionService.run(async () => {
    await lockForTransaction(userId);

    const emitUserCreated = async () => {
      if (!signupUser) return;
      await emit(
        EventTypes.USER_CREATED,
        "user",
        userId,
        { userId, email: signupUser.email, name: signupUser.name },
        null,
      );
    };

    const existingOrgId = await findActiveMemberOrgId(userId);
    if (existingOrgId) {
      await emitUserCreated();
      return existingOrgId;
    }

    const orgId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const slug = `personal-${orgId}`;
    const now = new Date();
    await insertPersonalOrgWithOwner({
      orgId,
      memberId,
      userId,
      slug,
      name: "Personal",
      createdAt: now,
    });
    await emit(
      EventTypes.ORG_CREATED,
      "organization",
      orgId,
      { organizationId: orgId, ownerUserId: userId, slug, name: "Personal" },
      orgId,
    );
    await emit(
      EventTypes.ORG_MEMBER_JOINED,
      "member",
      memberId,
      { organizationId: orgId, userId, role: "owner" },
      orgId,
    );
    await emitUserCreated();
    return orgId;
  });
}
