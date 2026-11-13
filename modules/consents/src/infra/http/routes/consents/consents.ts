import { CONSENT_COOKIE_NAME } from "@packages/cookie-consent";
import { AppErrorException, type IUseCase, Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { ConsentSettings } from "../../../../application/config/consent-settings";
import type { ConsentError } from "../../../../application/ports/repositories/consent.port";
import type { IGetActiveConsentQuery } from "../../../../application/queries/get-active-consent.query";
import type {
  RecordConsentInput,
  RecordConsentOutput,
} from "../../../../application/usecases/record-consent/record-consent.dto";
import type { WithdrawConsentInput } from "../../../../application/usecases/withdraw-consent/withdraw-consent.dto";
import {
  type BrowserCookieInput,
  type BrowserHeaderInput,
  type ConsentCookieSchema,
  consentCookieSchema,
  recordConsentBodySchema,
  type UserAgentHeaderSchema,
  userAgentHeaderSchema,
} from "./consents.schema";

const consentCookie = zV<
  ConsentCookieSchema,
  "cookie",
  RouteEnv,
  string,
  unknown,
  unknown,
  BrowserCookieInput
>("cookie", consentCookieSchema);
const userAgentHeader = zV<
  UserAgentHeaderSchema,
  "header",
  RouteEnv,
  string,
  unknown,
  unknown,
  BrowserHeaderInput
>("header", userAgentHeaderSchema);

export interface ConsentRoutesDeps {
  routeGuards: RouteGuards;
  consentSettings: ConsentSettings;
  RecordConsentUseCase: IUseCase<RecordConsentInput, RecordConsentOutput, ConsentError>;
  WithdrawConsentUseCase: IUseCase<WithdrawConsentInput, void, ConsentError>;
  IGetActiveConsentQuery: IGetActiveConsentQuery;
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
    .post(
      "/",
      g.denyImpersonated,
      zV("json", recordConsentBodySchema),
      consentCookie,
      userAgentHeader,
      async (c) => {
        const subjectId = Option.fromNullable(c.req.valid("cookie")[CONSENT_COOKIE_NAME]);

        const r = await deps.RecordConsentUseCase.execute({
          subjectId,
          userId: g.signedInUserId(c),
          categories: c.req.valid("json").categories,
          ipAddress: Option.some(g.clientIp(c)),
          userAgent: Option.fromNullable(c.req.valid("header")["user-agent"]),
        });
        if (r.isFailure) throw new AppErrorException(r.getError());

        const recorded = r.getValue();
        if (subjectId.isNone()) {
          setCookie(c, CONSENT_COOKIE_NAME, recorded.subjectId, cookieOptions);
        }

        return c.json({ categories: recorded.categories, policyVersion: recorded.policyVersion });
      },
    )
    .get("/", consentCookie, async (c) => {
      const subjectId = c.req.valid("cookie")[CONSENT_COOKIE_NAME];
      if (!subjectId) return c.json({ categories: null, policyVersion: null });

      const r = await deps.IGetActiveConsentQuery.execute({
        subjectId,
        userId: g.signedInUserId(c),
      });
      if (r.isFailure) throw new AppErrorException(r.getError());

      const active = r.getValue();

      return c.json({
        categories: active.map((record) => record.categories).toNull(),
        policyVersion: active.map((record) => record.policyVersion).toNull(),
      });
    })
    .delete("/", g.denyImpersonated, consentCookie, async (c) => {
      const subjectId = c.req.valid("cookie")[CONSENT_COOKIE_NAME];
      if (!subjectId) return c.json({ withdrawn: false });

      const r = await deps.WithdrawConsentUseCase.execute({
        subjectId,
        userId: g.signedInUserId(c),
      });
      if (r.isFailure) throw new AppErrorException(r.getError());

      return c.json({ withdrawn: true });
    });
}
