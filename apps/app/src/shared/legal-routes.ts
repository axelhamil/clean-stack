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
  labelKey:
    | "legal.routes.dataRights"
    | "legal.routes.privacyPolicy"
    | "legal.routes.terms"
    | "legal.routes.subProcessors"
    | "legal.routes.accessibility"
    | "legal.routes.cookies";
  icon: LucideIcon;
}

export const LEGAL_ROUTES: readonly LegalRoute[] = [
  { to: "/legal/data-rights", labelKey: "legal.routes.dataRights", icon: ShieldCheck },
  { to: "/legal/privacy-policy", labelKey: "legal.routes.privacyPolicy", icon: FileText },
  { to: "/legal/terms", labelKey: "legal.routes.terms", icon: ScrollText },
  { to: "/legal/sub-processors", labelKey: "legal.routes.subProcessors", icon: Database },
  {
    to: "/legal/accessibility",
    labelKey: "legal.routes.accessibility",
    icon: Accessibility,
  },
  { to: "/legal/cookies", labelKey: "legal.routes.cookies", icon: Cookie },
];
