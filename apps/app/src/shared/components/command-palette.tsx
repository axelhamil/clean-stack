/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Each group is built by its own `useXxxGroup()` hook returning a
 * `CommandGroupConfig` (or `null` to hide it conditionally). All hooks are
 * composed in `useCommandGroups()` — the rendering loop is data-driven.
 *
 * Extend:
 *  - new entry in an existing group → push into the relevant array
 *    (e.g. `NAVIGATION_ROUTES`, items of `useActionsGroup`)
 *  - new group entirely → write `useXxxGroup(): CommandGroupConfig | null`
 *    then add it to the composition in `useCommandGroups`
 *
 * Shortcuts:
 *  - declare `{ display, match }` on an entry
 *  - the global keybind handler fires the action when `match(e)` returns true
 *    (suppressed while typing in inputs/textareas/contenteditable)
 */

import type { OrgPermissions } from "@packages/access-control";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@packages/ui/components/ui/command";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
  ScrollText,
  ShieldCheck,
  Sun,
  User,
  Users,
  Webhook,
} from "lucide-react";
import { useTheme } from "next-themes";
import { type Dispatch, Fragment, type SetStateAction, useEffect, useRef, useState } from "react";
import { toastError, toastSuccess } from "../api/errors/toast";
import { activeOrgQueryOptions } from "../api/queries/active-org";
import { orgsListQueryOptions } from "../api/queries/orgs-list";
import { sessionQueryOptions } from "../api/queries/session";
import { isPlatformAdmin } from "../auth/is-platform-admin";
import { useAuthorization } from "../auth/use-authorization";
import { useSetActiveOrg } from "../auth/use-set-active-org";
import { useSignOut } from "../auth/use-sign-out";
import { LEGAL_ROUTES } from "../legal-routes";

interface CommandShortcutBinding {
  display: string;
  match: (event: KeyboardEvent) => boolean;
}

interface CommandEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  searchValue?: string;
  hint?: string;
  shortcut?: CommandShortcutBinding;
  run: () => void | Promise<void>;
}

interface CommandGroupConfig {
  heading: string;
  items: CommandEntry[];
}

const SIGN_OUT_SHORTCUT: CommandShortcutBinding = {
  display: "⇧⌘Q",
  match: (e) => e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "q",
};

interface NavigationRoute {
  to: string;
  label: string;
  icon: LucideIcon;
  requires?: OrgPermissions;
  requiresOrg?: boolean;
}

const NAVIGATION_ROUTES: readonly NavigationRoute[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/settings/organization",
    label: "Settings — Organization",
    icon: Users,
    requiresOrg: true,
  },
  {
    to: "/settings/billing",
    label: "Settings — Billing",
    icon: CreditCard,
    requires: { billing: ["manage"] },
    requiresOrg: true,
  },
  {
    to: "/settings/webhooks",
    label: "Settings — Webhooks",
    icon: Webhook,
    requires: { webhooks: ["read"] },
    requiresOrg: true,
  },
  { to: "/settings/account", label: "Settings — Account", icon: User },
  { to: "/settings/privacy", label: "Settings — Privacy", icon: ShieldCheck },
  { to: "/developers/events", label: "Developers — Event catalog", icon: BookOpen },
];

function useNavigationGroup(): CommandGroupConfig {
  const navigate = useNavigate();
  const { can, hasMembership } = useAuthorization();
  const visible = NAVIGATION_ROUTES.filter((route) => {
    if (route.requiresOrg && !hasMembership) return false;
    if (route.requires) return can(route.requires);
    return true;
  });
  return {
    heading: "Navigate",
    items: visible.map((route) => ({
      id: `nav:${route.to}`,
      label: route.label,
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

function useOrganizationGroup(): CommandGroupConfig | null {
  const navigate = useNavigate();
  const { data: orgs = [] } = useQuery(orgsListQueryOptions);
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const { switchOrg } = useSetActiveOrg();

  if (orgs.length === 0) return null;

  return {
    heading: "Switch organization",
    items: [
      ...orgs.map<CommandEntry>((org) => ({
        id: `org:${org.id}`,
        label: org.name,
        icon: Building2,
        searchValue: org.slug,
        hint: org.id === activeOrg?.id ? "active" : undefined,
        run: async () => {
          if (org.id !== activeOrg?.id) await switchOrg(org.id);
          void navigate({ to: "/dashboard" });
        },
      })),
      {
        id: "org:new",
        label: "New organization",
        icon: Plus,
        run: () => navigate({ to: "/org/new" }),
      },
    ],
  };
}

function useOperatorGroup(): CommandGroupConfig | null {
  const navigate = useNavigate();
  const { data: session } = useQuery(sessionQueryOptions);
  if (!isPlatformAdmin(session)) return null;
  return {
    heading: "Operator",
    items: [
      {
        id: "operator:audit-log",
        label: "Operator — Audit log",
        icon: ScrollText,
        run: () => navigate({ to: "/admin/audit-log" }),
      },
    ],
  };
}

function useLegalGroup(): CommandGroupConfig {
  const navigate = useNavigate();
  return {
    heading: "Legal & privacy",
    items: LEGAL_ROUTES.map((route) => ({
      id: `legal:${route.to}`,
      label: route.label,
      icon: route.icon,
      run: () => navigate({ to: route.to }),
    })),
  };
}

const THEME_OPTIONS = [
  { value: "light", label: "Theme: Light", icon: Sun },
  { value: "dark", label: "Theme: Dark", icon: Moon },
  { value: "system", label: "Theme: System", icon: Monitor },
] as const;

function useActionsGroup(): CommandGroupConfig {
  const { setTheme, theme } = useTheme();
  const signOut = useSignOut();
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);

  const items: CommandEntry[] = THEME_OPTIONS.map((option) => ({
    id: `theme:${option.value}`,
    label: option.label,
    icon: option.icon,
    hint: theme === option.value ? "active" : undefined,
    run: () => setTheme(option.value),
  }));

  if (activeOrg) {
    items.push({
      id: "action:copy-org-slug",
      label: "Copy org slug",
      icon: Copy,
      searchValue: activeOrg.slug,
      run: async () => {
        await navigator.clipboard.writeText(activeOrg.slug);
        toastSuccess("Org slug copied to clipboard");
      },
    });
  }

  items.push({
    id: "action:sign-out",
    label: "Sign out",
    icon: LogOut,
    shortcut: SIGN_OUT_SHORTCUT,
    run: () => signOut.mutate(),
  });

  return { heading: "Actions", items };
}

function useCommandGroups(): CommandGroupConfig[] {
  const navigation = useNavigationGroup();
  const organization = useOrganizationGroup();
  const operator = useOperatorGroup();
  const legal = useLegalGroup();
  const actions = useActionsGroup();

  return [navigation, organization, operator, legal, actions].filter(
    (group): group is CommandGroupConfig => group !== null,
  );
}

function isTypingInField(): boolean {
  const target = document.activeElement;
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (target as HTMLElement).isContentEditable;
}

function useTogglePaletteShortcut(setOpen: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

function useEntryShortcuts(groups: CommandGroupConfig[]) {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingInField()) return;
      for (const group of groupsRef.current) {
        for (const entry of group.items) {
          if (entry.shortcut?.match(e)) {
            e.preventDefault();
            Promise.resolve(entry.run()).catch((err) => toastError(err, "Action failed"));
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function buildSearchValue(entry: CommandEntry): string {
  return entry.searchValue ? `${entry.label} ${entry.searchValue}` : entry.label;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const groups = useCommandGroups();
  useTogglePaletteShortcut(setOpen);
  useEntryShortcuts(groups);

  const selectEntry = (entry: CommandEntry) => () => {
    setOpen(false);
    Promise.resolve(entry.run()).catch((err) => toastError(err, "Action failed"));
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions, organizations..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group, index) => (
          <Fragment key={group.heading}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.items.map((entry) => {
                const Icon = entry.icon;
                return (
                  <CommandItem
                    key={entry.id}
                    value={buildSearchValue(entry)}
                    onSelect={selectEntry(entry)}
                  >
                    <Icon />
                    <span className="flex-1 truncate">{entry.label}</span>
                    {entry.hint && (
                      <span className="text-xs text-muted-foreground">{entry.hint}</span>
                    )}
                    {entry.shortcut && <CommandShortcut>{entry.shortcut.display}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
