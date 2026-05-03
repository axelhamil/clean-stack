import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type SessionData, type SessionUser } from "../../auth";

type AuthVariables = {
  user: SessionUser | null;
  session: SessionData | null;
};

export const sessionMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  if (c.req.path.startsWith("/api/auth/") || c.req.path.startsWith("/internal/")) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
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
