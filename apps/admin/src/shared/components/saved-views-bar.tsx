import { type StaffView, type StaffViewScreen, storedStaffView } from "@packages/access-control";
import { Button } from "@packages/ui/components/ui/button";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { deleteViewMutationOptions, saveViewMutationOptions } from "../api/mutations/saved-views";
import { SAVED_VIEWS_QUERY_KEY, savedViewsQueryOptions } from "../api/queries/saved-views";
import { useOpenSavedView } from "../hooks/use-open-saved-view";
import { hasFilters, sameFilters, screenFilters } from "../saved-view-filters";
import { LoadErrorRetry } from "./load-error-retry";
import { SaveViewDialog } from "./save-view-dialog";

export type SavedViewsBarProps = {
  [S in StaffViewScreen]: { screen: S; filters: Extract<StaffView, { screen: S }>["filters"] };
}[StaffViewScreen];

export function SavedViewsBar(props: SavedViewsBarProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openView = useOpenSavedView();
  const query = useQuery(savedViewsQueryOptions);
  const refresh = () => queryClient.invalidateQueries({ queryKey: SAVED_VIEWS_QUERY_KEY });
  const views = query.data?.items.filter((view) => view.screen === props.screen) ?? [];
  const filters = screenFilters(props.screen, props.filters);
  const isSaved = views.some((view) => sameFilters(view.filters, filters));

  const save = useMutation({
    ...saveViewMutationOptions,
    onError: (err) => toastError(err, errorFallback("saveView")),
  });
  const remove = useMutation({
    ...deleteViewMutationOptions,
    onSuccess: () => {
      toast.success(t("backOffice.views.deleted"));
      void refresh();
    },
    onError: (err) => {
      toastError(err, errorFallback("deleteView"));
      void refresh();
    },
  });

  if (query.isError) {
    return <LoadErrorRetry message={t("backOffice.views.loadFailed")} onRetry={query.refetch} />;
  }

  const canSave = hasFilters(filters) && !isSaved;
  if (views.length === 0 && !canSave) return null;

  return (
    <ul aria-label={t("backOffice.views.label")} className="flex flex-wrap items-center gap-2">
      {views.map((view) => {
        const isApplied = sameFilters(view.filters, filters);

        return (
          <li key={view.id} className="flex max-w-full min-w-0 items-center gap-1">
            <Button
              variant={isApplied ? "secondary" : "outline"}
              size="sm"
              className="min-w-0 shrink"
              aria-pressed={isApplied}
              onClick={() => openView(view)}
            >
              <span className="truncate">{view.name}</span>
            </Button>
            <IconButton
              variant="ghost"
              size="icon-sm"
              label={t("backOffice.views.delete", { name: view.name })}
              disabled={remove.isPending}
              onClick={() => remove.mutate(view.id)}
            >
              <XIcon />
            </IconButton>
          </li>
        );
      })}
      {canSave && (
        <li>
          <SaveViewDialog
            isPending={save.isPending}
            onSave={(name, close) => {
              const view = storedStaffView({ screen: props.screen, name, filters });
              if (!view) return;

              save.mutate(view, {
                onSuccess: () => {
                  close();
                  toast.success(t("backOffice.views.saved"));
                  void refresh();
                },
              });
            }}
          />
        </li>
      )}
    </ul>
  );
}
