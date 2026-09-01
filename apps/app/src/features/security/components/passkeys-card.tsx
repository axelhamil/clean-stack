import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/ui/dialog";
import {
  ListRow,
  ListRowAction,
  ListRowContent,
  ListRowMedia,
  ListRowMeta,
} from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographySmall } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { passkeysQueryOptions } from "../../../shared/api/queries/passkeys";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import {
  type ImpersonationGuard,
  useImpersonationGuard,
} from "../../../shared/auth/use-impersonation-guard";
import { useFormatDate } from "../../../shared/i18n/use-format-date";
import { AddPasskeyForm } from "../forms/add-passkey-form";
import { useDeletePasskey } from "../hooks/use-delete-passkey";

export function PasskeysCard() {
  const { t } = useTranslation("settings");
  const { data, isLoading } = useQuery(passkeysQueryOptions);
  const [open, setOpen] = useState(false);
  // `/passkey` is on the BetterAuth impersonation blocklist — both registering
  // and deleting a passkey 403 while impersonating. One guard for the whole
  // card so the list rows share a single description node.
  const guard = useImpersonationGuard();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("passkeys.title")}</CardTitle>
        <CardDescription>{t("passkeys.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <TypographyMuted>{t("passkeys.loading")}</TypographyMuted>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("passkeys.add")}</DialogTitle>
              <DialogDescription>{t("passkeys.addDialogDescription")}</DialogDescription>
            </DialogHeader>
            <AddPasskeyForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
        <ImpersonationReason guard={guard} />
      </CardContent>
    </Card>
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
    <ListRow>
      <ListRowMedia>
        <KeyRoundIcon />
        <ListRowContent>
          <TypographySmall>{name ?? t("passkeys.unnamed")}</TypographySmall>
          <ListRowMeta>
            <Badge variant="secondary">
              {deviceType === "singleDevice" ? t("passkeys.deviceBound") : t("passkeys.synced")}
            </Badge>
            {backedUp && <Badge variant="outline">{t("passkeys.backedUp")}</Badge>}
            <TypographyMuted>
              {t("passkeys.added", { date: formatDate(createdAt) })}
            </TypographyMuted>
          </ListRowMeta>
        </ListRowContent>
      </ListRowMedia>
      <ListRowAction>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => mutation.mutate(id)}
          disabled={mutation.isPending || guard.blocked}
          {...guard.describeProps(mutation.isPending)}
          aria-label={t("passkeys.remove")}
        >
          <Trash2Icon />
        </Button>
      </ListRowAction>
    </ListRow>
  );
}
