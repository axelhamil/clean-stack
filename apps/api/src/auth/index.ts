// Type-only anchors: the inferred `auth` type references these packages' types, and TS
// can only name them portably from a direct dependency. @simplewebauthn/server must
// therefore stay on the exact major @better-auth/passkey depends on (13 as of passkey
// 1.7.14): a direct 14 resolves to a second copy and brings TS2883 back.
import "@simplewebauthn/server";
import "zod/v4/core";
// biome-ignore lint/correctness/noUnusedImports: type anchor, the inferred `auth` type names Stripe resources through this alias (TS2883)
import type Stripe from "stripe";
import { di } from "../container";
import { createAuth } from "./create-auth";

export { createAuthHelpers } from "./helpers";
export { scimMembershipDepsOf } from "./plugins/scim";

export const auth = createAuth(di.authDeps);

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;
