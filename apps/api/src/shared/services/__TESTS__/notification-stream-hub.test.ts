import { describe, expect, test } from "bun:test";
import { logger } from "../../logger";
import { NoOpInstrumentation } from "../noop-instrumentation";
import { MAX_STREAMS_PER_USER, NotificationStreamHub } from "../notification-stream-hub";

describe("NotificationStreamHub", () => {
  test("distribue un signal au seul destinataire concerne", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
    const recu: string[] = [];

    hub.subscribe("u1", () => recu.push("u1"));
    hub.subscribe("u2", () => recu.push("u2"));

    hub.dispatchSignal("u1");

    expect(recu).toEqual(["u1"]);
  });

  test("la desinscription libere le handle", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
    const unsubscribe = hub.subscribe("u1", () => {});

    expect(hub.subscriberCount("u1")).toBe(1);
    unsubscribe();
    expect(hub.subscriberCount("u1")).toBe(0);
  });

  test("plusieurs onglets du meme user recoivent chacun le signal", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
    let appels = 0;

    hub.subscribe("u1", () => appels++);
    hub.subscribe("u1", () => appels++);
    hub.dispatchSignal("u1");

    expect(appels).toBe(2);
  });

  test("un signal pour un user sans abonne ne touche pas les autres", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
    let appels = 0;
    hub.subscribe("u1", () => appels++);

    hub.dispatchSignal("inconnu");

    expect(appels).toBe(0);
    expect(hub.subscriberCount("u1")).toBe(1);
  });

  test("un handle qui jette n'empeche pas les autres de recevoir", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
    const recus: string[] = [];
    hub.subscribe("u1", () => {
      throw new Error("onglet mort");
    });
    hub.subscribe("u1", () => recus.push("second"));

    hub.dispatchSignal("u1");

    expect(recus).toEqual(["second"]);
  });

  test("le compteur declenche le plafond apres MAX_STREAMS_PER_USER abonnements", () => {
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());

    for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
      expect(hub.subscriberCount("u1") >= MAX_STREAMS_PER_USER).toBe(false);
      hub.subscribe("u1", () => {});
    }

    expect(hub.subscriberCount("u1") >= MAX_STREAMS_PER_USER).toBe(true);
  });
});
