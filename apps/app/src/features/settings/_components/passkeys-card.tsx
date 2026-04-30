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
import { passkeysQueryOptions } from "../../../adapters/queries/passkeys";
import { formatDate } from "../../../common/format-date";
import { AddPasskeyForm } from "../_forms/add-passkey-form";
import { useDeletePasskey } from "../_hooks/use-delete-passkey";

export function PasskeysCard() {
  const { data, isLoading } = useQuery(passkeysQueryOptions);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in with biometrics or a hardware key. Passkeys are phishing-resistant and replace
          passwords.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <TypographyMuted>Loading…</TypographyMuted>
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
              />
            ))}
          </ul>
        ) : (
          <TypographyMuted>No passkeys yet.</TypographyMuted>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-fit">
              <PlusIcon />
              Add a passkey
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a passkey</DialogTitle>
              <DialogDescription>Give it a name so you can identify it later.</DialogDescription>
            </DialogHeader>
            <AddPasskeyForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
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
}

function PasskeyRow({ id, name, deviceType, backedUp, createdAt }: PasskeyRowProps) {
  const mutation = useDeletePasskey();
  const created = formatDate(createdAt);

  return (
    <ListRow>
      <ListRowMedia>
        <KeyRoundIcon className="size-5 text-muted-foreground" />
        <ListRowContent>
          <TypographySmall>{name ?? "Unnamed passkey"}</TypographySmall>
          <ListRowMeta>
            <Badge variant="secondary">
              {deviceType === "singleDevice" ? "Device-bound" : "Synced"}
            </Badge>
            {backedUp && <Badge variant="outline">Backed up</Badge>}
            <TypographyMuted>Added {created}</TypographyMuted>
          </ListRowMeta>
        </ListRowContent>
      </ListRowMedia>
      <ListRowAction>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => mutation.mutate(id)}
          disabled={mutation.isPending}
          aria-label="Remove passkey"
        >
          <Trash2Icon />
        </Button>
      </ListRowAction>
    </ListRow>
  );
}
