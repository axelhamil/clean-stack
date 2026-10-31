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
import { Textarea } from "@packages/ui/components/ui/textarea";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  earliestExpiryDay,
  latestExpiryDay,
  overrideExpiryOf,
} from "../../../shared/override-expiry";
import { PLAN_TIERS, type PlanTier, planLabelKey } from "../plan-labels";

export interface PlanOverrideFormValues {
  tier: PlanTier;
  expiresAt: string;
  note: string;
}

export interface PlanOverrideFormProps {
  isPending: boolean;
  onSubmit: (values: PlanOverrideFormValues) => void;
}

export function PlanOverrideForm({ isPending, onSubmit }: PlanOverrideFormProps) {
  const { t } = useTranslation("admin");
  const tierId = useId();
  const endId = useId();
  const endErrorId = useId();
  const noteId = useId();
  const noteErrorId = useId();
  const [tier, setTier] = useState<PlanTier>("pro");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [isEndRefused, setIsEndRefused] = useState(false);
  const [isNoteRefused, setIsNoteRefused] = useState(false);
  const today = new Date();

  const submit = () => {
    const parsed = overrideExpiryOf(end);
    const trimmed = note.trim();
    setIsEndRefused(parsed.kind !== "at");
    setIsNoteRefused(trimmed.length === 0);
    if (parsed.kind !== "at" || trimmed.length === 0) return;

    onSubmit({ tier, expiresAt: parsed.iso, note: trimmed });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={tierId}>{t("orgs.planOverride.tierLabel")}</Label>
        <Select
          value={tier}
          onValueChange={(next) => {
            const found = PLAN_TIERS.find((candidate) => candidate === next);
            if (found) setTier(found);
          }}
        >
          <SelectTrigger id={tierId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_TIERS.map((candidate) => {
              const labelKey = planLabelKey(candidate);

              return (
                <SelectItem key={candidate} value={candidate}>
                  {labelKey ? t(labelKey) : candidate}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={endId}>{t("orgs.planOverride.endLabel")}</Label>
        <Input
          id={endId}
          type="date"
          min={earliestExpiryDay(today)}
          max={latestExpiryDay(today)}
          aria-invalid={isEndRefused}
          aria-describedby={isEndRefused ? endErrorId : undefined}
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
            setIsEndRefused(false);
          }}
        />
        {isEndRefused && (
          <TypographyMuted id={endErrorId} role="alert">
            {t("orgs.planOverride.endInvalid")}
          </TypographyMuted>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={noteId}>{t("orgs.planOverride.noteLabel")}</Label>
        <Textarea
          id={noteId}
          maxLength={1000}
          aria-invalid={isNoteRefused}
          aria-describedby={isNoteRefused ? noteErrorId : undefined}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setIsNoteRefused(false);
          }}
        />
        {isNoteRefused && (
          <TypographyMuted id={noteErrorId} role="alert">
            {t("orgs.planOverride.noteRequired")}
          </TypographyMuted>
        )}
      </div>

      <Button className="self-start" disabled={isPending} onClick={submit}>
        {t("orgs.planOverride.save")}
      </Button>
    </div>
  );
}
