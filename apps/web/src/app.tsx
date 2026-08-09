import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { I18nProvider } from "@/lib/i18n/I18nProvider.tsx";
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  createIndexedDbPersister,
  shouldPersistMutation,
  shouldPersistQuery,
} from "@/lib/persist";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";
// Imported for its SIDE EFFECT ([OFFLINE], owned by WEB-TX): it registers the
// mutation defaults that let a booking made offline be replayed. A restored
// mutation carries its variables but not its function, so those defaults
// must exist before `resumePausedMutations()` runs (CLAUDE.md gotcha #7). If
// this file does not exist yet, the app fails to build until WEB-TX adds it
// — expected while that feature group is still in progress.
import "@/features/transactions/lib/offline";

/**
 * ONE stable persister for the whole app lifetime. It resolves the account
 * it writes for on every call (`lib/persist.ts`), which is what keeps a
 * login as a different user from saving into the previous user's blob.
 */
const persister = createIndexedDbPersister();

/**
 * Provider stack:
 *   ErrorBoundary -> PersistQueryClient -> I18nProvider -> Toasts -> Router (-> SessionProvider)
 * The session provider deliberately lives inside the router so it can navigate.
 *
 * `PersistQueryClientProvider` rather than a `persistQueryClient()` call in
 * an effect, because it HOLDS BACK the first fetches until the restore has
 * finished. Without that gate an offline start would fire `/api/auth/me`,
 * fail, and paint "Server nicht erreichbar" a tick before the cached session
 * arrived.
 *
 * `onSuccess` fires once the restore has finished, and is where transaction
 * mutations queued offline are flushed. It has to be here rather than in a
 * screen: the mutations come out of the same blob the restore just read, and
 * the phone may well be reopened on a completely different route.
 */
export function App() {
  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
            shouldDehydrateMutation: shouldPersistMutation,
          },
        }}
        onSuccess={() => {
          // A failed replay must not become an unhandled rejection: the
          // mutation stays paused and the next reconnect tries again.
          void queryClient.resumePausedMutations().catch(() => undefined);
        }}
      >
        <I18nProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </I18nProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
