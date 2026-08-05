import { CONSENT_COOKIE_NAME, COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { di } from "../../container";
import { env } from "../../shared/env";
import type { AuthVariables } from "../../shared/middleware/auth.middleware";
import { resolveClientIp } from "../../shared/middleware/rate-limit.ip";
import { zV } from "../../shared/validator";
import { recordConsentDto } from "./application/dto/record-consent.dto";

const isProd = env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  path: "/",
};

export const consentRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/", zV("json", recordConsentDto), async (c) => {
    const body = c.req.valid("json");
    const userId = c.get("user")?.id;

    let subjectId = getCookie(c, CONSENT_COOKIE_NAME);
    if (!subjectId) {
      subjectId = crypto.randomUUID();
      setCookie(c, CONSENT_COOKIE_NAME, subjectId, cookieOptions);
    }

    const ip = resolveClientIp(c);
    const ua = c.req.header("user-agent");

    const r = await di.ConsentService.record({
      subjectId,
      userId,
      categories: body.categories,
      ip,
      ua,
    });
    if (r.isFailure) throw new AppErrorException(r.getError());

    return c.json({ categories: r.getValue().categories, policyVersion: COOKIE_CONSENT_VERSION });
  })
  .get("/", async (c) => {
    const subjectId = getCookie(c, CONSENT_COOKIE_NAME);
    if (!subjectId) return c.json({ categories: null, policyVersion: null });

    const userId = c.get("user")?.id;
    const r = await di.ConsentService.getActive(subjectId, COOKIE_CONSENT_VERSION, userId);
    if (r.isFailure) throw new AppErrorException(r.getError());

    const opt = r.getValue();
    const row = opt.isSome() ? opt.unwrap() : null;
    return c.json({
      categories: row?.categories ?? null,
      policyVersion: row?.policyVersion ?? null,
    });
  })
  .delete("/", async (c) => {
    const subjectId = getCookie(c, CONSENT_COOKIE_NAME);
    if (!subjectId) return c.json({ withdrawn: false });

    const userId = c.get("user")?.id;
    const r = await di.ConsentService.withdraw({ subjectId, userId });
    if (r.isFailure) throw new AppErrorException(r.getError());

    return c.json({ withdrawn: true });
  });
