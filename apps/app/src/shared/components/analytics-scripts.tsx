import { useEffect } from "react";
import { env } from "../env";
import { ConsentGate } from "./consent-gate";

function AnalyticsScript() {
  useEffect(() => {
    if (!env.VITE_ANALYTICS_SRC) return;
    const script = document.createElement("script");
    script.src = env.VITE_ANALYTICS_SRC;
    script.defer = true;
    script.dataset.consent = "analytics";
    document.head.append(script);
    return () => script.remove();
  }, []);
  return null;
}

export function AnalyticsScripts() {
  return (
    <ConsentGate category="analytics">
      <AnalyticsScript />
    </ConsentGate>
  );
}
