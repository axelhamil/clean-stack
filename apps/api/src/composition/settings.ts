import { defineModule } from "inwire";
import type { ConsentSettings } from "../modules/consents/application/config/consent-settings";
import type { env } from "../shared/env";

type SettingsSource = Pick<typeof env, "NODE_ENV">;

export const apiSettings = (source: SettingsSource) => {
  const consentSettings: ConsentSettings = { secureCookie: source.NODE_ENV === "production" };

  return defineModule<Record<never, never>>()((b) =>
    b.add("consentSettings", (): ConsentSettings => consentSettings),
  );
};
