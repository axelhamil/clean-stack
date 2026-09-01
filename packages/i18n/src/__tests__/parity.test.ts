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
    // Same word, same capitalization, in the notification bell's own group.
    "common.notifications.title",
    // Same word again, this time as the sr-only page heading on
    // /settings/notifications.
    "settings.notifications.title",
    // "Secret" is spelled identically in French — a genuine cognate, not an
    // untranslated placeholder.
    "common.secretReveal.secretLabel",
    // Platform names, not words: "Mac", "Windows" and "Linux" are proper nouns
    // that a French UI spells exactly as an English one does. The two device
    // labels that ARE phrases ("iOS device", "Browser") are translated.
    "settings.sessions.device.mac",
    "settings.sessions.device.windows",
    "settings.sessions.device.linux",
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
    // Example organization name — a fictional proper noun, not sentence copy.
    "common.orgNew.namePlaceholder",
    // "Pro" is used as-is in French SaaS pricing too — a short brand-like
    // cognate, not a sentence that was left untranslated (mirrors the
    // "Actions"/"Webhooks"/"Notifications" exemptions above).
    "settings.billing.tier.pro",
    // A bare `{{amount}}/{{interval}}` slash-separated template, not sentence
    // copy — it carries no words of its own, French included ("12 €/mois"
    // uses the same slash). The translation happens in the interpolated
    // `interval` value (`common.pricing.interval.*`), not in this template.
    "common.pricing.perInterval",
    // "Webhooks" is a correct French word too (already exempted once on the
    // nav tab, `common.contextualTabs.webhooks`); this is the same word on
    // the page's own `<h1>`, a distinct key path.
    "settings.webhooks.pageTitle",
    // The webhook delivery queue's terminal state. Kept in English on purpose:
    // "lettre morte" is a French idiom meaning "ignored", which reads as a
    // judgement rather than a queue state, and this badge is developer-facing
    // copy sitting beside the term the webhook documentation uses.
    "common.states.delivery.deadLetter",
    // "URL" is the same acronym in both languages, not an untranslated word.
    "settings.webhooks.endpointsTable.urlHeader",
    // Example webhook URL — a non-linguistic placeholder, not sentence copy
    // (mirrors the auth/account placeholder exemptions above).
    "settings.webhooks.form.urlPlaceholder",
    // Protocol acronyms, not sentence copy — a French SSO screen names OIDC
    // and SAML exactly as an English one does. Shared between the
    // registration Tabs triggers and the interpolated "{{type}} provider for
    // {{domain}}" line (see sso-labels.ts).
    "settings.sso.providerCard.type.oidc",
    "settings.sso.providerCard.type.saml",
    // Example domain, one placeholder per registration form (OIDC and SAML
    // are two distinct forms/keys, not a shared one) — a non-linguistic
    // placeholder, not sentence copy (mirrors the webhook URL exemption
    // above).
    "settings.sso.forms.oidc.domainPlaceholder",
    "settings.sso.forms.saml.domainPlaceholder",
    // Example issuer URL for the OIDC form — a non-linguistic placeholder.
    "settings.sso.forms.oidc.issuerPlaceholder",
    // Example SAML entity ID — a fictional identifier, not sentence copy.
    "settings.sso.forms.saml.issuerPlaceholder",
    // Example SAML entry-point URL — a non-linguistic placeholder.
    "settings.sso.forms.saml.entryPointPlaceholder",
    // Format example ticket reference for the admin impersonation form, not
    // copy — kept identical in both locales per the task brief.
    "admin.users.impersonateForm.ticketRefPlaceholder",
    // Genuine cognate — "permanent" is spelled identically in French.
    "admin.users.durationPermanent",
    // Acronym, identical in both languages.
    "admin.users.sessions.ipHeader",
    // "Type" is the same word in French too, matching the existing
    // "Actions" / "Webhooks" cognate exemptions above.
    "admin.users.sessions.typeHeader",
    // "Normal" is spelled identically in French too — a genuine cognate.
    "admin.users.sessions.typeNormal",
    // "Slug" has no established French translation in SaaS products — a
    // genuine cognate, not an untranslated placeholder. Two separate keys
    // (list table header, detail page label) so a translator can still word
    // them differently later.
    "admin.orgs.table.slug",
    "admin.orgs.detail.slugLabel",
    // Same word in French too, matching the existing "Actions" / "Webhooks"
    // cognate exemptions above.
    "admin.auditLog.table.action",
    // "DPA" (Data Processing Agreement) is the acronym used as-is in French
    // RGPD practice too — a genuine cognate, not an untranslated column
    // header. The DPA link text next to it (`sub-processors.route.tsx`) is
    // the same acronym for the same reason and isn't a catalog key.
    "common.legal.subProcessors.table.dpa",
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

  // Why this test exists: the en/fr gate above compares the two locales against
  // each other and is structurally blind to a catalog that is wrong *within* one
  // locale. A French `_one` collapsed onto its `_other` renders "1 jours" — a
  // grammar error no assertion in this repo caught until a human read the
  // output. English is deliberately not checked: its `_one` and `_other` are
  // legitimately identical wherever the noun does not inflect around `{{count}}`
  // (`common.notifications.unreadLabel_*` is exactly that). French always
  // inflects, so an identical pair there is a defect unless the noun itself is
  // invariable — those go on the list below, with their reason, like every other
  // exemption in this file.
  const ALLOWED_SAME_PLURAL_FORM: readonly string[] = [];

  it("no French plural collapses its singular onto its plural", () => {
    const allowed = new Set(ALLOWED_SAME_PLURAL_FORM);
    const offenders: string[] = [];
    for (const namespace of NAMESPACES) {
      for (const path of flatten(frCatalog[namespace] as unknown as Nested)) {
        if (!path.endsWith("_one")) continue;
        const stem = `${namespace}.${path.slice(0, -"_one".length)}`;
        if (allowed.has(stem)) continue;
        const one = valueAt(frCatalog, `${namespace}.${path}`);
        const other = valueAt(frCatalog, `${stem}_other`);
        if (one !== undefined && one === other) offenders.push(stem);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Same reason the identical-value exemptions are swept: a list nobody prunes
  // stops being a list of decisions and becomes a list of things unexamined.
  it("every plural exemption still names a genuinely identical French pair", () => {
    const stale = ALLOWED_SAME_PLURAL_FORM.filter((stem) => {
      const one = valueAt(frCatalog, `${stem}_one`);
      const other = valueAt(frCatalog, `${stem}_other`);
      return one === undefined || other === undefined || one !== other;
    });
    expect(stale).toEqual([]);
  });

  // A `_one` with no `_other` (or the reverse) is a key i18next will fall back
  // out of at runtime, silently, for exactly one count bucket.
  it("every plural key has both forms in both locales", () => {
    const incomplete: string[] = [];
    for (const [locale, catalog] of [
      ["en", enCatalog],
      ["fr", frCatalog],
    ] as const) {
      for (const namespace of NAMESPACES) {
        for (const path of flatten(catalog[namespace] as unknown as Nested)) {
          const suffix = path.endsWith("_one") ? "_one" : path.endsWith("_other") ? "_other" : null;
          if (suffix === null) continue;
          const stem = `${namespace}.${path.slice(0, -suffix.length)}`;
          const twin = suffix === "_one" ? `${stem}_other` : `${stem}_one`;
          if (valueAt(catalog, twin) === undefined) incomplete.push(`${locale}:${twin}`);
        }
      }
    }
    expect(incomplete).toEqual([]);
  });
});
