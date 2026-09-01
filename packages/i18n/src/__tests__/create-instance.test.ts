import { describe, expect, it } from "vitest";
import enCatalog from "../catalogs/en";
import { createI18n } from "../create-instance";
import { loadCatalog } from "../load-catalog";

describe("createI18n fallback", () => {
  it("falls back to the English string when a key is missing from the target locale", async () => {
    const frResources = await loadCatalog("fr");
    const resourcesWithGap = structuredClone(frResources);
    // Simulate a key present in `en` but not yet translated in `fr` — the
    // exact partial-translation state E.1a is meant to support.
    delete (resourcesWithGap.common as { actions: { retry?: string } }).actions.retry;

    const i18n = await createI18n({ locale: "fr", resources: resourcesWithGap });
    const t = i18n.getFixedT("fr", "common");

    expect(t("actions.retry")).toBe(enCatalog.common.actions.retry);
    expect(t("actions.retry")).not.toBe("actions.retry");
  });
});
