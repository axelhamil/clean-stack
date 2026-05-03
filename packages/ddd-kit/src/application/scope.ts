import type { UUID } from "../primitives/uuid";

export type RepoScope =
  | { readonly kind: "user"; readonly userId: UUID<string> }
  | { readonly kind: "org"; readonly organizationId: UUID<string> }
  | {
      readonly kind: "user-in-org";
      readonly userId: UUID<string>;
      readonly organizationId: UUID<string>;
    };

export type RepoScopeKind = RepoScope["kind"];

export type ScopeOf<K extends RepoScopeKind> = Extract<RepoScope, { kind: K }>;

export const RepoScope = {
  user(userId: UUID<string>): ScopeOf<"user"> {
    return { kind: "user", userId };
  },
  org(organizationId: UUID<string>): ScopeOf<"org"> {
    return { kind: "org", organizationId };
  },
  userInOrg(userId: UUID<string>, organizationId: UUID<string>): ScopeOf<"user-in-org"> {
    return { kind: "user-in-org", userId, organizationId };
  },
  isUser(s: RepoScope): s is ScopeOf<"user"> {
    return s.kind === "user";
  },
  isOrg(s: RepoScope): s is ScopeOf<"org"> {
    return s.kind === "org";
  },
  isUserInOrg(s: RepoScope): s is ScopeOf<"user-in-org"> {
    return s.kind === "user-in-org";
  },
} as const;
