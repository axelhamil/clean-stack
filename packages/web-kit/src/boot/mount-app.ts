import type { i18n as I18nInstance } from "i18next";
import type { ReactNode } from "react";
import { createRoot, type RootOptions } from "react-dom/client";
import { initI18n } from "../i18n/i18n";

export interface MountAppOptions {
  captureError: (error: unknown, context?: Record<string, unknown>) => void;
  onUncaughtError: RootOptions["onUncaughtError"];
  onCaughtError: RootOptions["onCaughtError"];
  onRecoverableError: RootOptions["onRecoverableError"];
  render: (i18n: I18nInstance) => ReactNode;
}

export async function mountApp({ captureError, render, ...handlers }: MountAppOptions) {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("#root not found");

  const i18n = await initI18n(captureError);

  createRoot(rootEl, handlers).render(render(i18n));
}
