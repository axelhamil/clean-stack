import { NavLink } from "@packages/ui/components/ui/nav-link";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LEGAL_ROUTES } from "../legal-routes";

export function LegalFooter() {
  const { t } = useTranslation("common");
  return (
    <footer className="border-t">
      <nav
        aria-label={t("legalFooter.ariaLabel")}
        className={cn(
          pageContainerVariants({ width: "wide" }),
          "flex flex-wrap items-center justify-center gap-x-8 gap-y-1 py-3",
        )}
      >
        {LEGAL_ROUTES.map((route) => (
          <NavLink key={route.to} size="sm" variant="plain" asChild>
            <Link to={route.to}>{t(route.labelKey)}</Link>
          </NavLink>
        ))}
      </nav>
    </footer>
  );
}
