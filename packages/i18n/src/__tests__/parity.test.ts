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

  const ALLOWED_IDENTICAL = [
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
    // Same two non-linguistic placeholders on the account settings screen: a
    // masked password and a digit pattern.
    "settings.twoFactor.passwordPlaceholder",
    "settings.twoFactor.codePlaceholder",
    "settings.deletion.passwordPlaceholder",
    "settings.deletion.totpPlaceholder",
  ] as const;

  const read = (root: Nested, path: string): string | undefined => {
    let cur: string | Nested | undefined = root;
    for (const seg of path.split(".")) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = (cur as Nested)[seg];
    }
    return typeof cur === "string" ? cur : undefined;
  };

  const valueAt = (catalog: unknown, full: string): string | undefined => {
    const [namespace, ...rest] = full.split(".");
    if (namespace === undefined) return undefined;
    const root = (catalog as Record<string, Nested>)[namespace];
    return root === undefined ? undefined : read(root, rest.join("."));
  };

  it("no French value is left identical to its English source placeholder", () => {
    // A copy-pasted English string is a translation that was never done.
    // Genuine identical pairs (proper nouns, "Email") are listed above.
    const allowed = new Set<string>(ALLOWED_IDENTICAL);
    const en = enCatalog as unknown as Record<string, Nested>;
    const offenders: string[] = [];
    for (const namespace of NAMESPACES) {
      for (const path of flatten(en[namespace] as Nested)) {
        const full = `${namespace}.${path}`;
        if (allowed.has(full)) continue;
        const e = valueAt(enCatalog, full);
        const f = valueAt(frCatalog, full);
        if (e !== undefined && e === f) offenders.push(full);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Why this test exists: an exemption list only ever grows, and an entry kept
  // after its string was finally translated turns the parity gate into a list
  // of things nobody will look at again. Making a stale entry fail is what
  // forces translating a string to also remove its exemption.
  it("every exemption is still an exact English/French match", () => {
    const stale = ALLOWED_IDENTICAL.filter((key) => {
      const e = valueAt(enCatalog, key);
      const f = valueAt(frCatalog, key);
      return e === undefined || e !== f;
    });
    expect(stale).toEqual([]);
  });
});
