import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { UNKNOWN_VISITOR, type VisitorGeo } from "../ports/ip-geo.port";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { ISessionGeoStore, PreviousSession } from "../ports/session-geo.port";
import {
  type SecuritySignalsConfig,
  SecuritySignalsService,
} from "../services/security-signals.service";
import { enqueuedEvents } from "./enqueued-events";

const OFF: SecuritySignalsConfig = { denyCountries: [], denyAsns: [] };
const NOW = new Date("2026-10-30T12:00:00Z");

const visitor = (country?: string, asn?: string): VisitorGeo => ({
  country: Option.fromNullable(country),
  asn: Option.fromNullable(asn),
});

function setup(config: SecuritySignalsConfig, previous: Option<PreviousSession> = Option.none()) {
  const store = mockPort<ISessionGeoStore>();
  store.findPreviousSession.mockResolvedValue(Result.ok(previous));
  const outbox = mockPort<IOutboxRepository>();
  const service = new SecuritySignalsService(store, outbox, config, () => NOW);

  return { store, outbox, service };
}

const previousIn = (country?: string): Option<PreviousSession> =>
  Option.some({
    id: "previous-session",
    country: Option.fromNullable(country),
    createdAt: new Date(NOW.getTime() - 600_000),
  });

const signIn = (geo: VisitorGeo) => ({
  userId: "user-1",
  sessionId: "new-session",
  ip: "203.0.113.1",
  visitor: geo,
});

const attempt = (geo: VisitorGeo) => ({
  visitor: geo,
  ip: "203.0.113.1",
  path: "/sign-in/email",
  actorUserId: null,
});

describe("SecuritySignalsService", () => {
  describe("flags off", () => {
    it("given no flag, when a visitor is known, then nothing is stored, read, refused or emitted", async () => {
      const { service, store, outbox } = setup(OFF, previousIn("FR"));
      const geo = visitor("KP", "64496");

      const refusal = await service.refuseDenied(attempt(geo));
      await service.reportImpossibleTravel(signIn(geo));

      expect(service.sessionFields(geo)).toEqual({});
      expect(refusal.isSuccess).toBe(true);
      expect(store.findPreviousSession).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("impossible travel", () => {
    const TRAVEL = { ...OFF, impossibleTravelWindowMinutes: 60 };

    it("given another country inside the window, when signing in, then the signal fires and does not block", async () => {
      const { service, store, outbox } = setup(TRAVEL, previousIn("FR"));

      await service.reportImpossibleTravel(signIn(visitor("JP")));

      expect(store.findPreviousSession).toHaveBeenCalledWith(
        "user-1",
        "new-session",
        new Date(NOW.getTime() - 3_600_000),
      );
      expect(enqueuedEvents(outbox)).toEqual([
        expect.objectContaining({
          eventType: EventTypes.SECURITY_IMPOSSIBLE_TRAVEL_DETECTED,
          payload: {
            userId: "user-1",
            sessionId: "new-session",
            previousSessionId: "previous-session",
            previousCountry: "FR",
            country: "JP",
            ip: "203.0.113.1",
            elapsedSeconds: 600,
          },
        }),
      ]);
    });

    it("given a previous session dated after this clock, then the elapsed time is 0, not a rejected negative", async () => {
      const ahead = Option.some({
        id: "previous-session",
        country: Option.some("FR"),
        createdAt: new Date(NOW.getTime() + 5_000),
      });
      const { service, outbox } = setup(TRAVEL, ahead);

      await service.reportImpossibleTravel(signIn(visitor("JP")));

      expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ elapsedSeconds: 0 });
    });

    it("given the same country, when signing in, then no signal fires", async () => {
      const { service, outbox } = setup(TRAVEL, previousIn("FR"));

      await service.reportImpossibleTravel(signIn(visitor("FR")));

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("given an unknown new country, when signing in, then no signal fires and nothing is read", async () => {
      const { service, store, outbox } = setup(TRAVEL, previousIn("FR"));

      await service.reportImpossibleTravel(signIn(UNKNOWN_VISITOR));

      expect(store.findPreviousSession).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("given an unknown previous country, when signing in, then no signal fires", async () => {
      const { service, outbox } = setup(TRAVEL, previousIn());

      await service.reportImpossibleTravel(signIn(visitor("JP")));

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("given no session inside the window, when signing in, then no signal fires", async () => {
      const { service, outbox } = setup(TRAVEL);

      await service.reportImpossibleTravel(signIn(visitor("JP")));

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("given a failing outbox, when the signal fires, then the sign-in is not broken", async () => {
      const { service, outbox } = setup(TRAVEL, previousIn("FR"));
      outbox.enqueue.mockRejectedValue(new Error("outbox down"));

      await expect(service.reportImpossibleTravel(signIn(visitor("JP")))).resolves.toBeUndefined();
    });

    it("given the flag on, when a country is known, then the session records it", () => {
      const { service } = setup(TRAVEL);

      expect(service.sessionFields(visitor("JP"))).toEqual({ country: "JP" });
      expect(service.sessionFields(UNKNOWN_VISITOR)).toEqual({});
    });
  });

  describe("deny-list", () => {
    const DENY = { denyCountries: ["KP"], denyAsns: ["64496"] };

    it("given a denied country, when attempting, then it refuses with the stable code and emits", async () => {
      const { service, outbox } = setup(DENY);

      const result = await service.refuseDenied(attempt(visitor("KP", "1")));

      expect(result.getError().code).toBe("SECURITY_GEO_FORBIDDEN");
      expect(enqueuedEvents(outbox)).toEqual([
        expect.objectContaining({
          eventType: EventTypes.SECURITY_GEO_DENIED,
          payload: {
            actorUserId: null,
            ip: "203.0.113.1",
            path: "/sign-in/email",
            country: "KP",
            asn: "1",
            reason: "country",
          },
        }),
      ]);
    });

    it("given a denied ASN and an unknown country, when attempting, then it refuses", async () => {
      const { service, outbox } = setup(DENY);

      const result = await service.refuseDenied(attempt(visitor(undefined, "64496")));

      expect(result.isFailure).toBe(true);
      expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ reason: "asn", country: null });
    });

    it("given an allowed or unknown visitor, when attempting, then it passes", async () => {
      const { service, outbox } = setup(DENY);

      expect((await service.refuseDenied(attempt(visitor("FR", "2")))).isSuccess).toBe(true);
      expect((await service.refuseDenied(attempt(UNKNOWN_VISITOR))).isSuccess).toBe(true);
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it("given a failing outbox, when a visitor is denied, then the refusal still holds", async () => {
      const { service, outbox } = setup(DENY);
      outbox.enqueue.mockRejectedValue(new Error("outbox down"));

      expect((await service.refuseDenied(attempt(visitor("KP")))).isFailure).toBe(true);
    });
  });
});
