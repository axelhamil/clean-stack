import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { useTranslation } from "react-i18next";

interface QueryLoadErrorProps {
  message: string;
  isFetching: boolean;
  onRetry: () => void;
}

export function QueryLoadError({ message, isFetching, onRetry }: QueryLoadErrorProps) {
  const { t } = useTranslation("common");

  return (
    <LoadErrorAlert
      message={message}
      retry={
        <Button variant="outline" size="sm" disabled={isFetching} onClick={onRetry}>
          {t("actions.retry")}
        </Button>
      }
    />
  );
}
