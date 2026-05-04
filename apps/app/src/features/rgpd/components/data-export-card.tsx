import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { DownloadIcon } from "lucide-react";
import { useRequestExport } from "../hooks/use-request-export";

const RATE_LIMIT_HOURS = 24;

interface DataExportCardProps {
  lastExportRequestedAt: Date | string | null | undefined;
}

export function DataExportCard({ lastExportRequestedAt }: DataExportCardProps) {
  const mutation = useRequestExport();

  const last = lastExportRequestedAt ? new Date(lastExportRequestedAt) : null;
  const nextAllowedAt = last ? new Date(last.getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000) : null;
  const cooldown = Boolean(nextAllowedAt && nextAllowedAt > new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download your data</CardTitle>
        <CardDescription>
          Receive a JSON archive of your account data by email. RGPD Art. 20 (right to portability).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending || cooldown}
          onClick={() => mutation.mutate()}
        >
          <DownloadIcon />
          {mutation.isPending ? "Requesting…" : "Request data export"}
        </Button>
        {cooldown && nextAllowedAt && (
          <TypographyMuted>
            Next request available {nextAllowedAt.toLocaleString()}.
          </TypographyMuted>
        )}
      </CardContent>
    </Card>
  );
}
