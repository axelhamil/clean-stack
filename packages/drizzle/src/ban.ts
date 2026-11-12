import { and, eq, gt, isNull, lte, or, type SQL } from "drizzle-orm";
import { user } from "./schema/auth";

export function banIsLive(now: Date): SQL | undefined {
  return and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)));
}

export function banIsNotLive(now: Date): SQL | undefined {
  return or(isNull(user.banned), eq(user.banned, false), lte(user.banExpires, now));
}
