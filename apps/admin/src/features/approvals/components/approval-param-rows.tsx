import { STAFF_PERMISSIONS, STAFF_ROLES } from "@packages/access-control";
import { banDurationLabelKey } from "@packages/staff-ui/staff-forms.schema";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { STAFF_PERMISSION_LABEL_KEYS, STAFF_ROLE_LABEL_KEYS } from "../../team/team-labels";

const banParamsSchema = z.object({
  reason: z.string(),
  expiresIn: z.number().optional(),
});

const roleParamsSchema = z.object({
  role: z.enum(STAFF_ROLES),
  fromRole: z.enum(STAFF_ROLES).nullable(),
});

const overrideParamsSchema = z.object({
  op: z.enum(["set", "revoke"]),
  permission: z.enum(STAFF_PERMISSIONS),
  effect: z.enum(["grant", "deny"]),
  expiresAt: z.string().nullable(),
});

const SECONDS_PER_DAY = 86_400;

interface ParamRow {
  label: string;
  value: string;
}

function useParamRows(action: string, params: unknown): ParamRow[] | null {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();

  if (action === "staff.revoke") return [];

  if (action === "user.ban_permanent") {
    const parsed = banParamsSchema.safeParse(params);
    if (!parsed.success) return null;

    const { reason, expiresIn } = parsed.data;
    const known = expiresIn === undefined ? null : banDurationLabelKey(expiresIn);
    const days = Math.ceil((expiresIn ?? 0) / SECONDS_PER_DAY);
    const timed = known ? t(known) : t("approvals.params.durationDays", { count: days });

    return [
      { label: t("approvals.params.reason"), value: reason },
      {
        label: t("approvals.params.duration"),
        value: expiresIn === undefined ? t("users.durationPermanent") : timed,
      },
    ];
  }

  if (action === "staff.role_change") {
    const parsed = roleParamsSchema.safeParse(params);
    if (!parsed.success) return null;

    const { role, fromRole } = parsed.data;

    return [
      {
        label: t("approvals.params.fromRole"),
        value: fromRole ? t(STAFF_ROLE_LABEL_KEYS[fromRole]) : t("approvals.params.noRole"),
      },
      { label: t("approvals.params.toRole"), value: t(STAFF_ROLE_LABEL_KEYS[role]) },
    ];
  }

  if (action === "staff.permission_override") {
    const parsed = overrideParamsSchema.safeParse(params);
    if (!parsed.success) return null;

    const { op, permission, effect, expiresAt } = parsed.data;

    return [
      { label: t("approvals.params.change"), value: t(`approvals.params.op.${op}`) },
      {
        label: t("team.permissions.permissionLabel"),
        value: t(STAFF_PERMISSION_LABEL_KEYS[permission]),
      },
      { label: t("team.permissions.effectLabel"), value: t(`team.permissions.effect.${effect}`) },
      {
        label: t("approvals.params.until"),
        value: expiresAt ? formatDateTime(expiresAt) : t("approvals.params.noEnd"),
      },
    ];
  }

  return null;
}

export interface ApprovalParamRowsProps {
  action: string;
  params: unknown;
}

export function ApprovalParamRows({ action, params }: ApprovalParamRowsProps) {
  const { t } = useTranslation("admin");
  const rows = useParamRows(action, params);

  if (!rows) {
    return (
      <DescriptionItem>
        <DescriptionTerm>{t("approvals.detail.params")}</DescriptionTerm>
        <DescriptionDetails>{t("approvals.params.unreadable")}</DescriptionDetails>
      </DescriptionItem>
    );
  }

  return rows.map((row) => (
    <DescriptionItem key={row.label}>
      <DescriptionTerm>{row.label}</DescriptionTerm>
      <DescriptionDetails className="wrap-anywhere">{row.value}</DescriptionDetails>
    </DescriptionItem>
  ));
}
