import { createI18n, loadCatalog, resolveLocale } from "@packages/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureError } from "../../observability/sentry";
import { initI18n } from "../i18n";

vi.mock("@packages/i18n", () => ({
  createI18n: vi.fn(),
  loadCatalog: vi.fn(),
  resolveLocale: vi.fn(),
  DEFAULT_LOCALE: "en",
}));

vi.mock("../../observability/sentry", () => ({ captureError: vi.fn() }));

vi.mock("../locale-cookie", () => ({
  readLocaleCookie: vi.fn(() => undefined),
  writeLocaleCookie: vi.fn(),
}));

function fakeInstance() {
  return { on: vi.fn(), language: "en" };
}

describe("initI18n", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    vi.stubGlobal("navigator", { languages: ["en-US"] });
  });

  it("resolves the instance for the detected locale on the happy path", async () => {
    vi.mocked(resolveLocale).mockReturnValue("fr");
    vi.mocked(loadCatalog).mockResolvedValue({ common: {} } as never);
    const instance = fakeInstance();
    vi.mocked(createI18n).mockResolvedValue(instance as never);

    const result = await initI18n();

    expect(result).toBe(instance);
    expect(captureError).not.toHaveBeenCalled();
    expect(createI18n).toHaveBeenCalledWith({ locale: "fr", resources: { common: {} } });
  });

  it("falls back to DEFAULT_LOCALE and reports the failure when the catalog fetch rejects once", async () => {
    vi.mocked(resolveLocale).mockReturnValue("fr");
    const boom = new Error("chunk load failed");
    vi.mocked(loadCatalog)
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({ common: {} } as never);
    const fallbackInstance = fakeInstance();
    vi.mocked(createI18n).mockResolvedValue(fallbackInstance as never);

    const result = await initI18n();

    expect(result).toBe(fallbackInstance);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledWith(boom, { stage: "i18n-init" });
    expect(createI18n).toHaveBeenCalledWith({ locale: "en", resources: { common: {} } });
  });

  it("re-throws and reports both failures when the fallback also fails", async () => {
    vi.mocked(resolveLocale).mockReturnValue("fr");
    const first = new Error("primary failure");
    const second = new Error("fallback failure");
    vi.mocked(loadCatalog).mockRejectedValueOnce(first).mockRejectedValueOnce(second);

    await expect(initI18n()).rejects.toThrow(second);
    expect(captureError).toHaveBeenCalledTimes(2);
    expect(captureError).toHaveBeenNthCalledWith(1, first, { stage: "i18n-init" });
    expect(captureError).toHaveBeenNthCalledWith(2, second, { stage: "i18n-init-fallback" });
  });
});
