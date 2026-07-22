import {
  Accessibility,
  Cookie,
  Database,
  FileText,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

export interface LegalRoute {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const LEGAL_ROUTES: readonly LegalRoute[] = [
  { to: "/legal/data-rights", label: "Data rights (RGPD)", icon: ShieldCheck },
  { to: "/legal/privacy-policy", label: "Privacy policy", icon: FileText },
  { to: "/legal/terms", label: "Terms of service", icon: ScrollText },
  { to: "/legal/sub-processors", label: "Sub-processors (RGPD Art. 28)", icon: Database },
  {
    to: "/legal/accessibility",
    label: "Accessibility statement (EAA Art. 14)",
    icon: Accessibility,
  },
  { to: "/legal/cookies", label: "Cookie policy (CNIL)", icon: Cookie },
];
