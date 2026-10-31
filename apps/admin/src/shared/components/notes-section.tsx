import { Button } from "@packages/ui/components/ui/button";
import { Label } from "@packages/ui/components/ui/label";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addNoteMutationOptions } from "../api/mutations/add-note";
import { type NoteSubject, notesQueryOptions } from "../api/queries/notes";
import { useStaff } from "../auth/use-staff";
import { LoadErrorRetry } from "./load-error-retry";

export interface NotesSectionProps {
  subject: NoteSubject;
}

export function NotesSection({ subject }: NotesSectionProps) {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const { can } = useStaff();
  const queryClient = useQueryClient();
  const bodyId = useId();
  const [body, setBody] = useState("");
  const query = useQuery(notesQueryOptions(subject));

  const add = useMutation({
    ...addNoteMutationOptions,
    onSuccess: () => {
      setBody("");
      toast.success(t("backOffice.notes.added"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "notes"] });
    },
    onError: (err) => toastError(err, errorFallback("addStaffNote")),
  });

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("backOffice.notes.title")}</TypographyH2>

      {can("notes.write") && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={bodyId}>{t("backOffice.notes.bodyLabel")}</Label>
          <Textarea
            id={bodyId}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <Button
            variant="outline"
            className="self-start"
            disabled={add.isPending || body.trim().length === 0}
            onClick={() => add.mutate({ subject, body })}
          >
            {t("backOffice.notes.add")}
          </Button>
        </div>
      )}

      {query.isPending && (
        <SkeletonTable label={t("backOffice.notes.loading")} columns={1} rows={2} />
      )}

      {query.isError && (
        <LoadErrorRetry message={t("backOffice.notes.loadFailed")} onRetry={query.refetch} />
      )}

      {query.data?.items.length === 0 && (
        <TypographyMuted>{t("backOffice.notes.empty")}</TypographyMuted>
      )}

      {query.data && query.data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {query.data.items.map((note) => (
            <ListRow key={note.id}>
              <ListRowContent>
                <p className="wrap-anywhere whitespace-pre-wrap">{note.body}</p>
                <TypographyMuted className="wrap-anywhere">
                  {`${note.authorName ?? t("backOffice.notes.formerStaff")} · ${formatDateTime(note.createdAt)}`}
                </TypographyMuted>
              </ListRowContent>
            </ListRow>
          ))}
        </ul>
      )}
    </section>
  );
}
