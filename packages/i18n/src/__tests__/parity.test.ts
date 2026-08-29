import { describe, expect, it } from "vitest";
import enCatalog, { NAMESPACES } from "../catalogs/en";
import frCatalog from "../catalogs/fr";

type Nested = { [key: string]: string | Nested };

function flatten(node: Nested, prefix = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

describe("catalog parity", () => {
  for (const namespace of NAMESPACES) {
    it(`${namespace}: fr has exactly the same keys as en`, () => {
      const en = flatten(enCatalog[namespace] as Nested).sort();
      const fr = flatten(frCatalog[namespace] as Nested).sort();

      const missingInFr = en.filter((k) => !fr.includes(k));
      const extraInFr = fr.filter((k) => !en.includes(k));

      expect({ missingInFr, extraInFr }).toEqual({ missingInFr: [], extraInFr: [] });
    });
  }

  it("both catalogs declare the same namespaces", () => {
    expect(Object.keys(frCatalog).sort()).toEqual(Object.keys(enCatalog).sort());
  });

  it("no French value is left identical to its English source placeholder", () => {
    // A copy-pasted English string is a translation that was never done.
    // Genuine identical pairs (proper nouns, "Email") are listed here explicitly.
    const ALLOWED_IDENTICAL = new Set([
      "common.brand",
      "settings.language.options.en",
      "settings.language.options.fr",
      // Short brand tag kept as-is in both locales, not sentence copy.
      "common.shell.brandLabel",
      // "Actions", "Webhooks" and "Notifications" are the correct French words too.
      "common.commandPalette.groups.actions",
      "common.contextualTabs.webhooks",
      "common.contextualTabs.notifications",
      // Non-linguistic placeholders: a masked password, a proper noun, a digit
      // pattern and a recovery-code pattern don't get translated. The example
      // email address IS translated (`you@` -> `vous@`, RFC 2606's
      // `example.com` stays), so it is deliberately not listed here.
      "auth.signIn.passwordPlaceholder",
      "auth.signUp.namePlaceholder",
      "auth.twoFactor.codePlaceholder",
      "auth.twoFactor.recoveryCodePlaceholder",
    ]);
    const en = enCatalog as unknown as Record<string, Nested>;
    const fr = frCatalog as unknown as Record<string, Nested>;
    const offenders: string[] = [];
    for (const namespace of NAMESPACES) {
      for (const path of flatten(en[namespace] as Nested)) {
        const full = `${namespace}.${path}`;
        if (ALLOWED_IDENTICAL.has(full)) continue;
        const read = (root: Nested, p: string): string | undefined => {
          let cur: string | Nested | undefined = root;
          for (const seg of p.split(".")) {
            if (typeof cur !== "object" || cur === null) return undefined;
            cur = (cur as Nested)[seg];
          }
          return typeof cur === "string" ? cur : undefined;
        };
        const e = read(en[namespace] as Nested, path);
        const f = read(fr[namespace] as Nested, path);
        if (e !== undefined && e === f) offenders.push(full);
      }
    }
    expect(offenders).toEqual([]);
  });
});
