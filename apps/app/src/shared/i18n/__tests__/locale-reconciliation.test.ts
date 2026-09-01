import { beforeEach, describe, expect, it } from "vitest";
import {
  getChosenLocale,
  markLocaleChosen,
  reconcileLocale,
  resetChosenLocale,
} from "../locale-reconciliation";

describe("reconcileLocale", () => {
  beforeEach(() => {
    resetChosenLocale();
  });

  it("applies the server locale when it differs from the active one", () => {
    expect(
      reconcileLocale({
        userLocale: "fr",
        activeLocale: "en",
        chosenLocale: undefined,
        impersonated: false,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "apply", locale: "fr" });
  });

  it("does nothing when the server and the active locale already agree", () => {
    expect(
      reconcileLocale({
        userLocale: "fr",
        activeLocale: "fr",
        chosenLocale: undefined,
        impersonated: false,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "none" });
  });

  // The regression this whole module exists for: saving "fr" flips the active
  // language, which re-runs the reconciliation while the session query — served
  // from BetterAuth's cookie cache — still reports the OLD "en". Re-asserting it
  // would revert both the UI and the locale cookie the save just wrote.
  it("does not bounce back to a stale server locale after a save and a refetch", () => {
    markLocaleChosen("fr");

    const afterSave = reconcileLocale({
      userLocale: "en",
      activeLocale: "fr",
      chosenLocale: getChosenLocale(),
      impersonated: false,
      alreadyPersisted: false,
    });
    expect(afterSave).toEqual({ action: "none" });

    const afterRefetchStillStale = reconcileLocale({
      userLocale: "en",
      activeLocale: "fr",
      chosenLocale: getChosenLocale(),
      impersonated: false,
      alreadyPersisted: false,
    });
    expect(afterRefetchStillStale).toEqual({ action: "none" });

    const afterRefetchFresh = reconcileLocale({
      userLocale: "fr",
      activeLocale: "fr",
      chosenLocale: getChosenLocale(),
      impersonated: false,
      alreadyPersisted: false,
    });
    expect(afterRefetchFresh).toEqual({ action: "none" });
  });

  it("still applies a server locale that matches what the user chose elsewhere", () => {
    markLocaleChosen("fr");
    expect(
      reconcileLocale({
        userLocale: "fr",
        activeLocale: "en",
        chosenLocale: getChosenLocale(),
        impersonated: false,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "apply", locale: "fr" });
  });

  it("seeds an empty server locale from the active one, exactly once", () => {
    expect(
      reconcileLocale({
        userLocale: null,
        activeLocale: "fr",
        chosenLocale: undefined,
        impersonated: false,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "persist", locale: "fr" });

    expect(
      reconcileLocale({
        userLocale: null,
        activeLocale: "fr",
        chosenLocale: undefined,
        impersonated: false,
        alreadyPersisted: true,
      }),
    ).toEqual({ action: "none" });
  });

  it("never writes a locale while impersonating", () => {
    expect(
      reconcileLocale({
        userLocale: undefined,
        activeLocale: "fr",
        chosenLocale: undefined,
        impersonated: true,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "none" });
  });

  it("ignores an unsupported active locale rather than persisting it", () => {
    expect(
      reconcileLocale({
        userLocale: null,
        activeLocale: "de",
        chosenLocale: undefined,
        impersonated: false,
        alreadyPersisted: false,
      }),
    ).toEqual({ action: "none" });
  });
});
