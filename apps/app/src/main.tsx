import "@packages/ui/globals.css";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./shared/app-providers";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(<AppProviders />);
