import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import { resolveDeviceLocale } from "@/lib/i18n/locale.ts";
import { initLocale } from "@/lib/i18n/store.ts";
import { registerServiceWorker } from "@/lib/pwa";
import { applyTheme, readThemePreference } from "@/lib/theme";
import "@/styles/index.css";

// Apply the stored colour scheme before the first paint (index.html's inline
// script already did this once; this keeps <html data-theme> and the store
// in agreement for the lifetime of the SPA, e.g. after a system-theme change).
applyTheme(readThemePreference());
// Seeds the ambient locale store AND <html lang> before the first render —
// `initLocale` (not `applyDocumentLocale` alone), or the store would stay at
// its DEFAULT_LOCALE initialiser while the document read a different locale.
initLocale(resolveDeviceLocale());
// Offline app shell (production only — a SW in front of vite dev breaks HMR).
registerServiceWorker();

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
