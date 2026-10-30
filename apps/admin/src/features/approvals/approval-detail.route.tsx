import { APPROVAL_ACTION_PERMISSION, isApprovalAction } from "@packages/access-control";
import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cancelApprovalMutationOptions } from "../../shared/api/mutations/cancel-approval";
import { requireSection } from "../../shared/auth/require-section";
import { useStaff } from "../../shared/auth/use-staff";
import { BackIcon, BackLink } from "../../shared/components/back-link";
import { DetailState } from "../../shared/components/detail-state";
import { approvalQueryOptions } from "./api/approvals.queries";
import { approvalActionLabelKey } from "./approval-labels";
import { ApprovalParamRows } from "./components/approval-param-rows";
import { DecideDialog } from "./components/decide-dialog";

export const Route = createFileRoute("/_staff/approvals/$id")({
  beforeLoad: requireSection("approvals"),
  component: ApprovalDetailPage,
});

interface UserRefProps {
  id: string;
}

function UserRef({ id }: UserRefProps) {
  const { can } = useStaff();

  if (!can("users.read")) return id;

  return (
    <NavLink asChild variant="plain">
      <Link to="/users/$id" params={{ id }}>
        {id}
      </Link>
    </NavLink>
  );
}

function ApprovalDetailPage() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const { id } = Route.useParams();
  const { can, me } = useStaff();
  const queryClient = useQueryClient();
  const query = useQuery(approvalQueryOptions(id));
  const cancel = useMutation({
    ...cancelApprovalMutationOptions,
    onSuccess: () => {
      toast.success(t("backOffice.awaiting.cancelled"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "approvals"] });
    },
    onError: (err) => toastError(err, errorFallback("cancelApproval")),
  });

  return (
    <DetailState
      query={query}
      fallbackTitle={t("approvals.pageTitle")}
      loadingLabel={t("approvals.loading")}
      errorMessage={t("approvals.detail.loadFailed")}
      back={
        <BackLink
          link={
            <Link to="/approvals">
              <BackIcon />
              {t("approvals.pageTitle")}
            </Link>
          }
        />
      }
    >
      {(approval) => {
        const labelKey = approvalActionLabelKey(approval.action);
        const pending = approval.status === "pending";
        const isOverdue = new Date(approval.expiresAt).getTime() <= Date.now();
        const isRequester = approval.requestedBy === me.id;
        const isSubject = approval.subjectId === me.id;
        const holdsActionPermission =
          isApprovalAction(approval.action) && can(APPROVAL_ACTION_PERMISSION[approval.action]);
        const mayDecide = !isRequester && !isSubject && holdsActionPermission;

        return (
          <>
            <PageHeader
              title={labelKey ? t(labelKey) : approval.action}
              actions={
                <Badge variant={pending ? "secondary" : "outline"}>
                  {t(`approvals.status.${approval.status}`)}
                </Badge>
              }
            />

            {pending && (
              <div className="flex flex-wrap items-center gap-2">
                {isOverdue && <TypographyMuted>{t("approvals.detail.overdue")}</TypographyMuted>}
                {mayDecide && !isOverdue && (
                  <>
                    <DecideDialog approvalId={approval.id} decision="approve" />
                    <DecideDialog approvalId={approval.id} decision="reject" />
                  </>
                )}
                {isRequester && !isOverdue && (
                  <>
                    <TypographyMuted>{t("approvals.detail.ownRequest")}</TypographyMuted>
                    <Button
                      variant="outline"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(approval.id)}
                    >
                      {t("backOffice.awaiting.cancel")}
                    </Button>
                  </>
                )}
                {!isOverdue && !isRequester && !isSubject && !holdsActionPermission && (
                  <TypographyMuted>{t("approvals.detail.needsPermission")}</TypographyMuted>
                )}
                {!isOverdue && isSubject && !isRequester && (
                  <TypographyMuted>{t("approvals.detail.aboutYou")}</TypographyMuted>
                )}
              </div>
            )}

            <DescriptionList>
              <DescriptionItem>
                <DescriptionTerm>{t("approvals.detail.subject")}</DescriptionTerm>
                <DescriptionDetails className="wrap-anywhere">
                  <UserRef id={approval.subjectId} />
                </DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>{t("approvals.detail.requester")}</DescriptionTerm>
                <DescriptionDetails className="wrap-anywhere">
                  <UserRef id={approval.requestedBy} />
                </DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>{t("approvals.table.requested")}</DescriptionTerm>
                <DescriptionDetails>{formatDateTime(approval.createdAt)}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>{t("approvals.table.expires")}</DescriptionTerm>
                <DescriptionDetails>{formatDateTime(approval.expiresAt)}</DescriptionDetails>
              </DescriptionItem>
              {approval.decidedBy && (
                <DescriptionItem>
                  <DescriptionTerm>{t("approvals.detail.decidedBy")}</DescriptionTerm>
                  <DescriptionDetails className="wrap-anywhere">
                    <UserRef id={approval.decidedBy} />
                  </DescriptionDetails>
                </DescriptionItem>
              )}
              {approval.decisionNote && (
                <DescriptionItem>
                  <DescriptionTerm>{t("approvals.detail.noteLabel")}</DescriptionTerm>
                  <DescriptionDetails className="wrap-anywhere">
                    {approval.decisionNote}
                  </DescriptionDetails>
                </DescriptionItem>
              )}
              {approval.failureReason && (
                <DescriptionItem>
                  <DescriptionTerm>{t("approvals.detail.failure")}</DescriptionTerm>
                  <DescriptionDetails className="wrap-anywhere">
                    {approval.failureReason}
                  </DescriptionDetails>
                </DescriptionItem>
              )}
              <ApprovalParamRows action={approval.action} params={approval.params} />
            </DescriptionList>
          </>
        );
      }}
    </DetailState>
  );
}
