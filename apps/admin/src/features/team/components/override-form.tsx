import { STAFF_PERMISSIONS, type StaffPermission } from "@packages/access-control";
import { Button } from "@packages/ui/components/ui/button";
import { Input } from "@packages/ui/components/ui/input";
import { Label } from "@packages/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { overrideExpiryOf } from "../override-expiry";
import { STAFF_PERMISSION_LABEL_KEYS } from "../team-labels";

export interface OverrideFormValues {
  permission: StaffPermission;
  effect: "grant" | "deny";
  expiresAt: string | null;
}

export interface OverrideFormProps {
  isPending: boolean;
  onSubmit: (values: OverrideFormValues) => void;
}

export function OverrideForm({ isPending, onSubmit }: OverrideFormProps) {
  const { t } = useTranslation("admin");
  const expiryId = useId();
  const [permission, setPermission] = useState<StaffPermission>("users.read");
  const [effect, setEffect] = useState<"grant" | "deny">("grant");
  const [expiry, setExpiry] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={permission}
          onValueChange={(next) => {
            const found = STAFF_PERMISSIONS.find((candidate) => candidate === next);
            if (found) setPermission(found);
          }}
        >
          <SelectTrigger aria-label={t("team.permissions.permissionLabel")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_PERMISSIONS.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {t(STAFF_PERMISSION_LABEL_KEYS[candidate])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={effect}
          onValueChange={(next) => {
            if (next === "grant" || next === "deny") setEffect(next);
          }}
        >
          <SelectTrigger aria-label={t("team.permissions.effectLabel")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grant">{t("team.permissions.effect.grant")}</SelectItem>
            <SelectItem value="deny">{t("team.permissions.effect.deny")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={expiryId}>{t("team.permissions.expiresLabel")}</Label>
        <Input
          id={expiryId}
          type="date"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
        />
      </div>
      <Button
        variant="outline"
        className="self-start"
        disabled={isPending}
        onClick={() => onSubmit({ permission, effect, expiresAt: overrideExpiryOf(expiry) })}
      >
        {t("team.permissions.add")}
      </Button>
    </div>
  );
}
