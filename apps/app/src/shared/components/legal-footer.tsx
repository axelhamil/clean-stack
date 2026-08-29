import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LEGAL_ROUTES } from "../legal-routes";

export function LegalFooter() {
  const { t } = useTranslation("common");
  return (
    <footer className="border-t">
      <nav
        aria-label={t("legalFooter.ariaLabel")}
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-6 sm:px-6"
      >
        {LEGAL_ROUTES.map((route) => (
          <NavLink key={route.to} variant="underline" asChild>
            <Link to={route.to}>{route.label}</Link>
          </NavLink>
        ))}
      </nav>
    </footer>
  );
}
