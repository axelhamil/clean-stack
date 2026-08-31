// R3: the prose is deliberately not translated — `policies.config.tsx` itself
// says in its own copy that it is placeholder legalese to be replaced with
// real counsel-reviewed text before production, and a boilerplate is in no
// position to guess a clone owner's actual policy. The value this file ships
// is the *slot*: a clone owner drops their own French `PrivacyPolicyBody`/
// `TermsBody` in here and the rest of the app (routing, the version/effective
// chrome, the acceptance flow) needs no further change.
//
// Until that happens, re-exporting the English bodies by reference — not by
// copy — is what keeps `policy-doc-view.tsx`'s fallback banner honest:
// `policies/index.ts` compares the resolved French body against the English
// one by identity, so the banner fires today (same function) and stops
// firing the moment a real French body lands here (different function),
// with no locale check to keep in sync by hand.
export { PrivacyPolicyBody, TermsBody } from "./en";
