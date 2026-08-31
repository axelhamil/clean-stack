import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

interface UntranslatedBodyBannerProps {
  show: boolean;
}

// Shared by every legal page whose body prose stays English by design (R3,
// extended to the whole legal surface — task 14 review round 1: a French
// title over an English body with no disclosure is the "translating half a
// page is worse than none" defect the recipe names). Each call site decides
// `show` for its own reason:
//  - `policy-doc-view.tsx` compares the resolved body's identity against the
//    canonical English one (`isEnglishFallback`), so it stops firing on its
//    own the day a clone owner writes a real French body;
//  - `accessibility.route.tsx`, `cookies.route.tsx`, `data-rights.route.tsx`
//    and `sub-processors.route.tsx` have no French body at all, so their
//    condition is simply "the active locale isn't English".
// Promoted here once the same `<Alert>` markup would otherwise have been
// copied five times (rule #2's second-occurrence trigger, three pages ago).
export function UntranslatedBodyBanner({ show }: UntranslatedBodyBannerProps) {
  const { t } = useTranslation("common");
  if (!show) return null;
  return (
    <Alert>
      <Languages />
      <AlertDescription>{t("legal.policies.unavailableBanner")}</AlertDescription>
    </Alert>
  );
}
