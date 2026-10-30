import type { ReactNode } from "react";

import { Alert, AlertDescription } from "./alert";

export interface LoadErrorAlertProps {
  message: ReactNode;
  retry?: ReactNode;
}

function LoadErrorAlert({ message, retry }: LoadErrorAlertProps) {
  return (
    <Alert variant="destructive">
      <AlertDescription className="gap-2">
        {message}
        {retry}
      </AlertDescription>
    </Alert>
  );
}

export { LoadErrorAlert };
