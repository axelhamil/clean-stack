import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import { Hint } from "@packages/ui/components/ui/hint";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMedia,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { passkeysQueryOptions } from "../../../shared/api/queries/passkeys";
import { GuardHint } from "../../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import {
  type ImpersonationGuard,
  useImpersonationGuard,
} from "../../../shared/auth/use-impersonation-guard";
import { AddPasskeyForm } from "../forms/add-passkey-form";
import { useDeletePasskey } from "../hooks/use-delete-passkey";

export function PasskeysCard() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { data, isLoading, isLoadingError } = useQuery(passkeysQueryOptions);
  const [open, setOpen] = useState(false);
  // `/passkey` is on the BetterAuth impersonation blocklist: both registering
  // and deleting a passkey 403 while impersonating. One guard for the whole
  // card so the list rows share a single description node.
  const guard = useImpersonationGuard();

  return (
    <SettingsSection title={t("passkeys.title")} description={t("passkeys.description")}>
      {isLoading ? (
        <TypographyMuted>{t("passkeys.loading")}</TypographyMuted>
      ) : isLoadingError ? (
        <LoadErrorAlert message={t("passkeys.loadFailed")} />
      ) : data && data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              id={passkey.id}
              name={passkey.name}
              deviceType={passkey.deviceType}
              backedUp={passkey.backedUp}
              createdAt={passkey.createdAt}
              guard={guard}
            />
          ))}
        </ul>
      ) : (
        <TypographyMuted>{t("passkeys.empty")}</TypographyMuted>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <GuardHint guard={guard}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-fit"
              disabled={guard.blocked}
              {...guard.describeProps()}
            >
              <PlusIcon />
              {t("passkeys.add")}
            </Button>
          </DialogTrigger>
        </GuardHint>
        <DialogContent closeLabel={tCommon("actions.close")}>
          <DialogHeader>
            <DialogTitle>{t("passkeys.add")}</DialogTitle>
            <DialogDescription>{t("passkeys.addDialogDescription")}</DialogDescription>
          </DialogHeader>
          <AddPasskeyForm onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <ImpersonationReason guard={guard} />
    </SettingsSection>
  );
}

interface PasskeyRowProps {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date;
  guard: ImpersonationGuard;
}

function PasskeyRow({ id, name, deviceType, backedUp, createdAt, guard }: PasskeyRowProps) {
  const { t } = useTranslation("settings");
  const formatDate = useFormatDate();
  const mutation = useDeletePasskey();

  return (
    <ListRow variant="plain">
      <ListRowMedia>
        <KeyRoundIcon />
        <ListRowContent>
          <TypographySmall>{name ?? t("passkeys.unnamed")}</TypographySmall>
          <ListRowMeta className="flex-wrap">
            <Hint
              text={
                deviceType === "singleDevice"
                  ? t("passkeys.deviceBoundHint")
                  : t("passkeys.syncedHint")
              }
            >
              <Badge variant="secondary">
                {deviceType === "singleDevice" ? t("passkeys.deviceBound") : t("passkeys.synced")}
              </Badge>
            </Hint>
            {backedUp && (
              <Hint text={t("passkeys.backedUpHint")}>
                <Badge variant="outline">{t("passkeys.backedUp")}</Badge>
              </Hint>
            )}
            <TypographyMuted>
              {t("passkeys.added", { date: formatDate(createdAt) })}
            </TypographyMuted>
          </ListRowMeta>
        </ListRowContent>
      </ListRowMedia>
      <ListRowAction>
        <GuardHint guard={guard} otherwiseDisabled={mutation.isPending}>
          <IconButton
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => mutation.mutate(id)}
            disabled={mutation.isPending || guard.blocked}
            {...guard.describeProps(mutation.isPending)}
            label={t("passkeys.remove")}
          >
            <Trash2Icon />
          </IconButton>
        </GuardHint>
      </ListRowAction>
    </ListRow>
  );
}
