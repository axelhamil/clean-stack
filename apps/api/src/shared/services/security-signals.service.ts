import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEventBestEffort } from "../event-emitter";
import type { VisitorGeo } from "../ports/ip-geo.port";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { ISessionGeoStore } from "../ports/session-geo.port";

export interface SecuritySignalsConfig {
  denyCountries: readonly string[];
  denyAsns: readonly string[];
  impossibleTravelWindowMinutes?: number;
}

export type GeoDeniedError = AppError<"SECURITY_GEO_FORBIDDEN">;

const GEO_DENIED: GeoDeniedError = {
  code: "SECURITY_GEO_FORBIDDEN",
  message:
    "Access is not available from your network or region. Turn off any VPN or proxy and try again, or contact support.",
};

export class SecuritySignalsService {
  constructor(
    private readonly store: ISessionGeoStore,
    private readonly outbox: IOutboxRepository,
    private readonly config: SecuritySignalsConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  sessionFields(visitor: VisitorGeo): { country?: string } {
    if (this.config.impossibleTravelWindowMinutes === undefined) return {};

    return visitor.country.isSome() ? { country: visitor.country.unwrap() } : {};
  }

  async refuseDenied(attempt: {
    visitor: VisitorGeo;
    ip: string | null;
    path: string;
    actorUserId: string | null;
  }): Promise<Result<void, GeoDeniedError>> {
    const { visitor, ip, path, actorUserId } = attempt;
    const reason = this.denialReason(visitor);
    if (reason.isNone()) return Result.ok();

    await emitEventBestEffort(
      this.outbox,
      EventTypes.SECURITY_GEO_DENIED,
      "security",
      path,
      {
        actorUserId,
        ip,
        path,
        country: visitor.country.toNull(),
        asn: visitor.asn.toNull(),
        reason: reason.unwrap(),
      },
      "geo denial event emit failed, still refusing the request",
    );

    return Result.fail(GEO_DENIED);
  }

  async reportImpossibleTravel(signIn: {
    userId: string;
    sessionId: string;
    ip: string | null;
    visitor: VisitorGeo;
  }): Promise<void> {
    const windowMinutes = this.config.impossibleTravelWindowMinutes;
    if (windowMinutes === undefined || signIn.visitor.country.isNone()) return;

    const country = signIn.visitor.country.unwrap();
    const now = this.now();
    const since = new Date(now.getTime() - windowMinutes * 60_000);
    const lookup = await this.store.findPreviousSession(signIn.userId, signIn.sessionId, since);
    if (lookup.isFailure || lookup.getValue().isNone()) return;

    const previous = lookup.getValue().unwrap();
    if (previous.country.isNone() || previous.country.unwrap() === country) return;

    await emitEventBestEffort(
      this.outbox,
      EventTypes.SECURITY_IMPOSSIBLE_TRAVEL_DETECTED,
      "security",
      signIn.sessionId,
      {
        userId: signIn.userId,
        sessionId: signIn.sessionId,
        previousSessionId: previous.id,
        previousCountry: previous.country.unwrap(),
        country,
        ip: signIn.ip,
        elapsedSeconds: Math.max(
          0,
          Math.floor((now.getTime() - previous.createdAt.getTime()) / 1000),
        ),
      },
      "impossible travel event emit failed, the sign-in stands",
    );
  }

  private denialReason(visitor: VisitorGeo): Option<"country" | "asn"> {
    const { denyCountries, denyAsns } = this.config;
    if (visitor.country.filter((country) => denyCountries.includes(country)).isSome()) {
      return Option.some("country");
    }
    if (visitor.asn.filter((asn) => denyAsns.includes(asn)).isSome()) return Option.some("asn");

    return Option.none();
  }
}
