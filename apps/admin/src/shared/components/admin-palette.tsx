import {
  CommandPaletteDialog,
  type CommandPaletteGroup,
  useTogglePaletteShortcut,
} from "@packages/ui/components/ui/command-palette";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bookmark,
  Building2,
  CheckCheck,
  House,
  type LucideIcon,
  ScrollText,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { paletteOrgsQueryOptions, paletteUsersQueryOptions } from "../api/queries/palette-search";
import { savedViewsQueryOptions } from "../api/queries/saved-views";
import { useStaff } from "../auth/use-staff";
import { useDebouncedFilter } from "../hooks/use-debounced-filter";
import { useOpenSavedView } from "../hooks/use-open-saved-view";
import { type Section, sectionsOpenTo } from "../nav/sections";

const SEARCH_MIN_LENGTH = 2;

const SECTION_ICONS: Record<Section["id"], LucideIcon> = {
  users: Users,
  orgs: Building2,
  audit: ScrollText,
  operations: Activity,
  approvals: CheckCheck,
  team: ShieldCheck,
};

export function AdminPalette() {
  const { t } = useTranslation(["admin", "common"]);
  const navigate = useNavigate();
  const openView = useOpenSavedView();
  const { me, can } = useStaff();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [draft, setDraft] = useDebouncedFilter(term, setTerm);
  useTogglePaletteShortcut(setOpen);

  useEffect(() => {
    if (open) return;

    setDraft("");
    setTerm("");
  }, [open, setDraft]);

  const search = term.trim();
  const isSearching = search.length >= SEARCH_MIN_LENGTH;
  const views = useQuery({ ...savedViewsQueryOptions, enabled: open });
  const users = useQuery({
    ...paletteUsersQueryOptions(search),
    enabled: open && isSearching && can("users.read"),
  });
  const orgs = useQuery({
    ...paletteOrgsQueryOptions(search),
    enabled: open && isSearching && can("orgs.read"),
  });

  const groups: CommandPaletteGroup[] = [
    {
      heading: t("backOffice.palette.groups.navigate"),
      items: [
        {
          id: "nav:home",
          label: t("backOffice.home.title"),
          icon: House,
          run: () => navigate({ to: "/" }),
        },
        ...sectionsOpenTo(me.permissions).map((section) => ({
          id: `nav:${section.id}`,
          label: t(`backOffice.sections.${section.id}`),
          icon: SECTION_ICONS[section.id],
          run: () => navigate({ to: "/$section", params: { section: section.id } }),
        })),
      ],
    },
    {
      heading: t("backOffice.palette.groups.views"),
      items: (views.data?.items ?? []).map((view) => ({
        id: `view:${view.id}`,
        label: view.name,
        icon: Bookmark,
        searchValue: view.id,
        hint: t(`backOffice.sections.${view.screen}`),
        run: () => openView(view),
      })),
    },
    {
      heading: t("backOffice.palette.groups.accounts"),
      items: (isSearching ? (users.data?.items ?? []) : []).map((user) => ({
        id: `user:${user.id}`,
        label: user.name ? `${user.name}, ${user.email}` : user.email,
        icon: User,
        searchValue: user.id,
        run: () => navigate({ to: "/users/$id", params: { id: user.id } }),
      })),
    },
    {
      heading: t("backOffice.palette.groups.organizations"),
      items: (isSearching ? (orgs.data?.items ?? []) : []).map((org) => ({
        id: `org:${org.id}`,
        label: `${org.name}, ${org.slug}`,
        icon: Building2,
        searchValue: org.id,
        run: () => navigate({ to: "/orgs/$id", params: { id: org.id } }),
      })),
    },
  ].filter((group) => group.items.length > 0);

  const isPending = draft.trim() !== search || users.isFetching || orgs.isFetching;
  const emptyKey = isPending
    ? "backOffice.palette.searching"
    : users.isError || orgs.isError
      ? "backOffice.palette.searchFailed"
      : "backOffice.palette.noResults";

  return (
    <CommandPaletteDialog
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      title={t("backOffice.palette.title")}
      description={t("backOffice.palette.description")}
      closeLabel={t("common:actions.close")}
      searchPlaceholder={t("backOffice.palette.placeholder")}
      emptyLabel={t(emptyKey)}
      onEntryFailed={(err) => toastError(err, t("backOffice.palette.actionFailed"))}
      search={draft}
      onSearchChange={setDraft}
    />
  );
}
