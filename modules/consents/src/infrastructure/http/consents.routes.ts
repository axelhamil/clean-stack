import { CONSENT_COOKIE_NAME, COOKIE_CONSENT_VERSION } from "@packages/cookie-consent";
import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { ConsentSettings } from "../../application/config/consent-settings";
import { recordConsentDto } from "../../application/dto/record-consent.dto";
import type { ConsentService } from "../../application/services/consent.service";

export interface ConsentRoutesDeps {
  routeGuards: RouteGuards;
  consentSettings: ConsentSettings;
  ConsentService: Pick<ConsentService, "record" | "getActive" | "withdraw">;
}

export function createConsentRoutes(deps: ConsentRoutesDeps) {
  const { routeGuards: g } = deps;
  const secure = deps.consentSettings.secureCookie;
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path: "/",
  };

  return new Hono<RouteEnv>()
    .post("/", g.denyImpersonated, zV("json", recordConsentDto), async (c) => {
      const body = c.req.valid("json");
      const userId = g.signedInUserId(c).toUndefined();

      let subjectId = getCookie(c, CONSENT_COOKIE_NAME);
      if (!subjectId) {
        subjectId = crypto.randomUUID();
        setCookie(c, CONSENT_COOKIE_NAME, subjectId, cookieOptions);
      }

      const ip = g.clientIp(c);
      const ua = c.req.header("user-agent");

      const r = await deps.ConsentService.record({
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

      const userId = g.signedInUserId(c).toUndefined();
      const r = await deps.ConsentService.getActive(subjectId, COOKIE_CONSENT_VERSION, userId);
      if (r.isFailure) throw new AppErrorException(r.getError());

      const active = r.getValue();

      return c.json({
        categories: active.map((row) => row.categories).toNull(),
        policyVersion: active.map((row) => row.policyVersion).toNull(),
      });
    })
    .delete("/", g.denyImpersonated, async (c) => {
      const subjectId = getCookie(c, CONSENT_COOKIE_NAME);
      if (!subjectId) return c.json({ withdrawn: false });

      const userId = g.signedInUserId(c).toUndefined();
      const r = await deps.ConsentService.withdraw({ subjectId, userId });
      if (r.isFailure) throw new AppErrorException(r.getError());

      return c.json({ withdrawn: true });
    });
}
