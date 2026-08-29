import { beforeEach, describe, expect, it } from "vitest";
import { getChosenLocale, markLocaleChosen } from "../../i18n/locale-reconciliation";
import { broadcastAuthChange } from "../auth-broadcast";

describe("broadcastAuthChange", () => {
  beforeEach(() => {
    markLocaleChosen("fr");
  });

  // The regression this test pins: a profile save or an avatar upload calls
  // broadcastAuthChange() to refresh the same person's session across tabs.
  // That must never clear the locale the user just picked in LanguageCard —
  // otherwise the next session refetch reads the still-cookie-cached "en" row
  // and LocaleSync flips the UI straight back.
  it("does not reset the chosen locale for a same-identity refresh (profile update, avatar upload)", () => {
    broadcastAuthChange();

    expect(getChosenLocale()).toBe("fr");
  });

  // The case the marker exists for: a sign-out, or an impersonation
  // start/stop, hands the tab to a (possibly) different person and must not
  // leave the previous person's chosen locale standing.
  it("resets the chosen locale for an identity change (sign-out, impersonation start/stop)", () => {
    broadcastAuthChange({ identityChanged: true });

    expect(getChosenLocale()).toBeUndefined();
  });
});
