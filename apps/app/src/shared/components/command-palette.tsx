import {
  CommandPaletteDialog,
  type CommandPaletteEntry,
  type CommandPaletteGroup,
  useEntryShortcuts,
  useTogglePaletteShortcut,
} from "@packages/ui/components/ui/command-palette";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
  BookOpen,
  Building2,
  Copy,
  CreditCard,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  User,
  Users,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../api/queries/active-org";
import { orgsListQueryOptions } from "../api/queries/orgs-list";
import { type NavigationRequirement, useAuthorization } from "../auth/use-authorization";
import { useSetActiveOrg } from "../auth/use-set-active-org";
import { SIGN_OUT_SHORTCUT, useSignOut } from "../auth/use-sign-out";
import { LEGAL_ROUTES } from "../legal-routes";

interface NavigationRoute extends NavigationRequirement {
  to: string;
  labelKey:
    | "nav.dashboard"
    | "commandPalette.nav.organization"
    | "commandPalette.nav.billing"
    | "commandPalette.nav.webhooks"
    | "commandPalette.nav.account"
    | "commandPalette.nav.privacy"
    | "commandPalette.nav.eventCatalog";
  icon: LucideIcon;
}

const NAVIGATION_ROUTES: readonly NavigationRoute[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  {
    to: "/settings/organization",
    labelKey: "commandPalette.nav.organization",
    icon: Users,
    requiresOrg: true,
  },
  {
    to: "/settings/billing",
    labelKey: "commandPalette.nav.billing",
    icon: CreditCard,
    requires: { billing: ["manage"] },
    requiresOrg: true,
  },
  {
    to: "/settings/webhooks",
    labelKey: "commandPalette.nav.webhooks",
    icon: Webhook,
    requires: { webhooks: ["read"] },
    requiresOrg: true,
  },
  { to: "/settings/account", labelKey: "commandPalette.nav.account", icon: User },
  { to: "/settings/privacy", labelKey: "commandPalette.nav.privacy", icon: ShieldCheck },
  { to: "/developers/events", labelKey: "commandPalette.nav.eventCatalog", icon: BookOpen },
];

function useNavigationGroup(t: TFunction<"common">): CommandPaletteGroup {
  const navigate = useNavigate();
  const { canReach } = useAuthorization();
  const visible = NAVIGATION_ROUTES.filter(canReach);

  return {
    heading: t("commandPalette.groups.navigate"),
    items: visible.map((route) => ({
      id: `nav:${route.to}`,
      label: t(route.labelKey),
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

function useOrganizationGroup(t: TFunction<"common">): CommandPaletteGroup | null {
  const navigate = useNavigate();
  const { data: orgs = [] } = useQuery(orgsListQueryOptions);
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const { switchOrg } = useSetActiveOrg();

  if (orgs.length === 0) return null;

  return {
    heading: t("commandPalette.groups.switchOrganization"),
    items: [
      ...orgs.map<CommandPaletteEntry>((org) => ({
        id: `org:${org.id}`,
        label: org.name,
        icon: Building2,
        searchValue: org.slug,
        hint: org.id === activeOrg?.id ? t("commandPalette.organizationActive") : undefined,
        run: async () => {
          if (org.id !== activeOrg?.id) await switchOrg(org.id);
          void navigate({ to: "/dashboard" });
        },
      })),
      {
        id: "org:new",
        label: t("orgSwitcher.newOrganization"),
        icon: Plus,
        run: () => navigate({ to: "/org/new" }),
      },
    ],
  };
}

function useLegalGroup(t: TFunction<"common">): CommandPaletteGroup {
  const navigate = useNavigate();
  return {
    heading: t("commandPalette.groups.legal"),
    items: LEGAL_ROUTES.map((route) => ({
      id: `legal:${route.to}`,
      label: t(route.labelKey),
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

function themeOptionsFor(t: TFunction<"common">) {
  return [
    { value: "light", label: t("commandPalette.theme.light"), icon: Sun },
    { value: "dark", label: t("commandPalette.theme.dark"), icon: Moon },
    { value: "system", label: t("commandPalette.theme.system"), icon: Monitor },
  ] as const;
}

function useActionsGroup(t: TFunction<"common">): CommandPaletteGroup {
  const { setTheme, theme } = useTheme();
  const signOut = useSignOut();
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const themeOptions = themeOptionsFor(t);

  const items: CommandPaletteEntry[] = themeOptions.map((option) => ({
    id: `theme:${option.value}`,
    label: option.label,
    icon: option.icon,
    hint: theme === option.value ? t("commandPalette.theme.active") : undefined,
    run: () => setTheme(option.value),
  }));

  if (activeOrg) {
    items.push({
      id: "action:copy-org-slug",
      label: t("commandPalette.copyOrgSlug"),
      icon: Copy,
      searchValue: activeOrg.slug,
      run: async () => {
        await navigator.clipboard.writeText(activeOrg.slug);
        toastSuccess(t("commandPalette.orgSlugCopiedToast"));
      },
    });
  }

  items.push({
    id: "action:sign-out",
    label: t("userMenu.signOut"),
    icon: LogOut,
    shortcut: SIGN_OUT_SHORTCUT,
    run: () => signOut.mutate(),
  });

  return { heading: t("commandPalette.groups.actions"), items };
}

function useCommandGroups(t: TFunction<"common">): CommandPaletteGroup[] {
  const navigation = useNavigationGroup(t);
  const organization = useOrganizationGroup(t);
  const legal = useLegalGroup(t);
  const actions = useActionsGroup(t);

  return [navigation, organization, legal, actions].filter(
    (group): group is CommandPaletteGroup => group !== null,
  );
}

export function CommandPalette() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const groups = useCommandGroups(t);
  const onEntryFailed = (err: unknown) => toastError(err, t("commandPalette.actionFailed"));
  useTogglePaletteShortcut(setOpen);
  useEntryShortcuts(groups, onEntryFailed);

  return (
    <CommandPaletteDialog
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      title={t("commandPalette.title")}
      description={t("commandPalette.description")}
      closeLabel={t("actions.close")}
      searchPlaceholder={t("commandPalette.searchPlaceholder")}
      emptyLabel={t("commandPalette.noResults")}
      onEntryFailed={onEntryFailed}
    />
  );
}
