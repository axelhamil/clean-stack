import { describe, expect, it } from "vitest";
import { DEVICE_KEYS, type DeviceKind, summarizeUserAgent } from "../components/sessions-card";

// `satisfies Record<DeviceKind, string>` proves every kind has *a* key; it can
// never prove the key is the right one. Two entries swapped compile, type-check
// and render — only an entry-by-entry assertion catches that.
describe("DEVICE_KEYS", () => {
  it("maps each device kind to its own catalog key", () => {
    expect(DEVICE_KEYS).toStrictEqual({
      ios: "sessions.device.ios",
      android: "sessions.device.android",
      mac: "sessions.device.mac",
      windows: "sessions.device.windows",
      linux: "sessions.device.linux",
      browser: "sessions.device.browser",
    });
  });

  // That each key resolves is already proven at the call site: `DEVICE_KEYS` is
  // `as const`, so `t(DEVICE_KEYS[kind])` fails type-check the moment a key
  // stops existing in the catalog. Asserting it again here would test tsc.
});

describe("summarizeUserAgent", () => {
  const cases: ReadonlyArray<readonly [string, DeviceKind]> = [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "linux"],
    ["curl/8.7.1", "browser"],
  ];

  for (const [ua, expected] of cases) {
    it(`classifies ${expected} from ${ua.slice(0, 32)}`, () => {
      expect(summarizeUserAgent(ua)).toBe(expected);
    });
  }

  // Android user agents also contain "Linux"; the ordering of the checks is the
  // only thing that keeps a phone from being reported as a desktop.
  it("prefers android over linux when the user agent claims both", () => {
    expect(summarizeUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
  });
});
