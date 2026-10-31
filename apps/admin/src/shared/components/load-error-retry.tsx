import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { useTranslation } from "react-i18next";

export interface LoadErrorRetryProps {
  message: string;
  onRetry: () => unknown;
}

export function LoadErrorRetry({ message, onRetry }: LoadErrorRetryProps) {
  const { t } = useTranslation("admin");

  return (
    <LoadErrorAlert
      message={message}
      retry={
        <Button variant="outline" size="sm" onClick={() => onRetry()}>
          {t("backOffice.reload")}
        </Button>
      }
    />
  );
}
