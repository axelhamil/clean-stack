import type { SubProcessorId } from "./sub-processors.config";

// The register in `sub-processors.config.ts` stays English — it restates the
// signed DPA — but `purpose` and `region` are the two fields a user actually
// reads, on the privacy settings card and on the public register page. Both
// read the same keys, so the two surfaces can never drift apart. They live in
// `common.legal` rather than under either page's own namespace precisely
// because neither page owns them.
export const SUB_PROCESSOR_KEYS = {
  resend: {
    purpose: "legal.subProcessors.resend.purpose",
    region: "legal.subProcessors.resend.region",
  },
  r2: {
    purpose: "legal.subProcessors.r2.purpose",
    region: "legal.subProcessors.r2.region",
  },
  betterAuth: {
    purpose: "legal.subProcessors.betterAuth.purpose",
    region: "legal.subProcessors.betterAuth.region",
  },
  stripe: {
    purpose: "legal.subProcessors.stripe.purpose",
    region: "legal.subProcessors.stripe.region",
  },
  umami: {
    purpose: "legal.subProcessors.umami.purpose",
    region: "legal.subProcessors.umami.region",
  },
} as const satisfies Record<SubProcessorId, { purpose: string; region: string }>;
