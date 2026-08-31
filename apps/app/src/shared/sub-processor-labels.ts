import type { SubProcessorId } from "./sub-processors.config";

// The register in `sub-processors.config.ts` stays English — it restates the
// signed DPA — but `purpose` and `region` are the two fields a user actually
// reads, on the privacy settings card and on the public register page. Both
// read the same keys, so the two surfaces can never drift apart.
export const SUB_PROCESSOR_KEYS = {
  resend: {
    purpose: "privacy.dataSources.processors.resend.purpose",
    region: "privacy.dataSources.processors.resend.region",
  },
  r2: {
    purpose: "privacy.dataSources.processors.r2.purpose",
    region: "privacy.dataSources.processors.r2.region",
  },
  betterAuth: {
    purpose: "privacy.dataSources.processors.betterAuth.purpose",
    region: "privacy.dataSources.processors.betterAuth.region",
  },
  stripe: {
    purpose: "privacy.dataSources.processors.stripe.purpose",
    region: "privacy.dataSources.processors.stripe.region",
  },
  umami: {
    purpose: "privacy.dataSources.processors.umami.purpose",
    region: "privacy.dataSources.processors.umami.region",
  },
} as const satisfies Record<SubProcessorId, { purpose: string; region: string }>;
