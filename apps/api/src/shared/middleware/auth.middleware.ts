import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type SessionData, type SessionUser } from "../../auth";
import { di } from "../../container";

const IMPERSONATION_STOP_PATH = "/admin/impersonation/stop";

type AuthVariables = {
  user: SessionUser | null;
  session: SessionData | null;
};

export function isCurrentlyBanned(user: {
  banned?: boolean | null;
  banExpires?: Date | null;
}): boolean {
  if (user.banned !== true) return false;

  return !user.banExpires || new Date(user.banExpires).getTime() > Date.now();
}

export const sessionMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  if (
    c.req.path.startsWith("/api/auth/") ||
    c.req.path.startsWith("/internal/") ||
    c.req.path.startsWith("/api/v1/")
  ) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  const impersonator = result?.session?.impersonatedBy;
  if (
    impersonator &&
    c.req.path !== IMPERSONATION_STOP_PATH &&
    !(await di.StaffAccessService.impersonatorHolds(impersonator))
  ) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  if (result && isCurrentlyBanned(result.user) && c.req.path !== IMPERSONATION_STOP_PATH) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);

  await next();
});

export const requireAuth = createMiddleware<{
  Variables: {
    user: SessionUser;
    session: SessionData;
  };
}>(async (c, next) => {
  const user = c.get("user") as SessionUser | null;
  const session = c.get("session") as SessionData | null;

  if (!user || !session) throw new HTTPException(401, { message: "Unauthorized" });

  c.set("user", user);
  c.set("session", session);

  await next();
});

export type { AuthVariables };
