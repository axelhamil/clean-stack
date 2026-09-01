export type SubProcessorId = "resend" | "r2" | "betterAuth" | "stripe" | "umami";

export interface SubProcessor {
  /**
   * Stable catalog key for the vendor's purpose and region. The register itself
   * stays English — it restates what the signed DPA says, and the DPA is not
   * translated — but the two fields a user reads on screen are copy, so they
   * live in the catalog like every other rendered string.
   */
  id: SubProcessorId;
  name: string;
  purpose: string;
  region: string;
  category: "infra" | "email" | "auth" | "analytics" | "payments";
  url?: string;
  dpaUrl?: string;
  status: "active" | "planned";
}

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    id: "resend",
    name: "Resend",
    purpose: "Transactional email delivery",
    region: "US (EU DPF-certified)",
    category: "email",
    url: "https://resend.com",
    dpaUrl: "https://resend.com/legal/dpa",
    status: "active",
  },
  {
    id: "r2",
    name: "Cloudflare R2",
    purpose: "Object storage (file uploads)",
    region: "EU or US (zone configurable)",
    category: "infra",
    url: "https://cloudflare.com",
    dpaUrl: "https://www.cloudflare.com/cloudflare-customer-dpa/",
    status: "active",
  },
  {
    id: "betterAuth",
    name: "BetterAuth (GitHub/Google OAuth)",
    purpose: "OAuth social authentication",
    region: "US / EU (per provider)",
    category: "auth",
    url: "https://better-auth.com",
    status: "active",
  },
  {
    id: "stripe",
    name: "Stripe",
    purpose: "Payment processing and billing",
    region: "US (EU DPF-certified)",
    category: "payments",
    url: "https://stripe.com",
    dpaUrl: "https://stripe.com/legal/dpa",
    status: "planned",
  },
  {
    id: "umami",
    name: "Umami",
    purpose: "Privacy-friendly web analytics",
    region: "Configurable (self-hostable)",
    category: "analytics",
    url: "https://umami.is",
    status: "planned",
  },
];
