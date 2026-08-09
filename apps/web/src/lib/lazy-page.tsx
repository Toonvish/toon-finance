/**
 * Route-level code splitting WITHOUT hard imports.
 *
 * Screens owned by the next two feature agents (transactions/overview/plan/
 * categories) do not exist yet while `WEB-KERN` builds the router. Referencing
 * them with a static `import()` would break both `tsc` and the build until
 * those files exist, so the router resolves them through `import.meta.glob`
 * instead: whatever is present is lazily loaded and code-split, whatever is
 * missing renders a clearly labelled placeholder that names the file the
 * router expects — a red typecheck for the missing screens is EXPECTED while
 * they are being built (docs/spec.md "Solange die Dateien fehlen, ist der
 * Typecheck rot").
 */
import { Suspense, lazy, type ComponentType, type ReactElement } from "react";
import { Hammer } from "lucide-react";
import { useT, type MessageKey } from "@/lib/i18n/I18nProvider.tsx";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingBlock } from "@/components/ui/Spinner";

type PageModule = Record<string, unknown>;

/**
 * Every page module in the app, keyed by path relative to the vite root.
 * The public auth screens the router imports statically are excluded,
 * otherwise rollup cannot code-split them (INEFFECTIVE_DYNAMIC_IMPORT).
 */
const pageModules = import.meta.glob<PageModule>([
  "/src/features/**/*.tsx",
  "!/src/features/auth/LoginPage.tsx",
  "!/src/features/auth/RegisterPage.tsx",
  "!/src/features/auth/ForgotPasswordPage.tsx",
  "!/src/features/auth/ResetPasswordPage.tsx",
  "!/src/features/auth/InvitePage.tsx",
]);

export interface PageSpec {
  /** Module paths to try, in priority order (e.g. "/src/features/plan/PlanPage.tsx"). */
  candidates: readonly string[];
  /** Named exports to accept when a module has no default export. */
  exportNames?: readonly string[];
  /** Placeholder heading while the page does not exist yet — a catalog key, not a string. */
  title: MessageKey;
  description?: MessageKey;
}

function isComponent(value: unknown): value is ComponentType<Record<string, never>> {
  return typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value);
}

function pickComponent(
  module: PageModule,
  exportNames: readonly string[] = [],
): ComponentType<Record<string, never>> | null {
  if (isComponent(module.default)) return module.default;
  for (const name of exportNames) {
    const candidate = module[name];
    if (isComponent(candidate)) return candidate;
  }
  return null;
}

function MissingPage({ spec }: { spec: PageSpec }) {
  const t = useT();
  // `spec.description` (when set) is a plain, placeholder-free key; the
  // default "common.missingPage" is the only one that takes `{path}` — kept
  // as two separate literal calls (not `key ?? fallback` in one call) so
  // `t()`'s per-key overload can be resolved against a single literal type
  // instead of a union.
  const description = spec.description ? t(spec.description) : t("common.missingPage", { path: spec.candidates[0] ?? "" });
  return (
    <div className="mx-auto w-full max-w-lg p-4">
      <EmptyState
        icon={<Hammer />}
        title={t(spec.title)}
        description={
          <>
            {description}
            <br />
            <code className="mt-2 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs break-all">
              {spec.candidates[0]}
            </code>
          </>
        }
      />
    </div>
  );
}

/**
 * Builds a lazily-loaded route component from a {@link PageSpec}.
 * The returned component brings its own Suspense boundary, so it can be
 * handed straight to a TanStack Router route.
 */
export function lazyPage(spec: PageSpec): () => ReactElement {
  const Lazy = lazy(async () => {
    for (const path of spec.candidates) {
      const load = pageModules[path];
      if (!load) continue;
      const module = await load();
      const component = pickComponent(module, spec.exportNames);
      if (component) return { default: component };
      console.warn(
        `[router] ${path} does not export a page component (default${
          spec.exportNames?.length ? ` or ${spec.exportNames.join("/")}` : ""
        }).`,
      );
    }
    return { default: () => <MissingPage spec={spec} /> };
  });

  return function LazyPage() {
    return (
      <Suspense fallback={<LoadingBlock />}>
        <Lazy />
      </Suspense>
    );
  };
}

/** Module paths currently available — handy when debugging a missing screen. */
export function availablePageModules(): string[] {
  return Object.keys(pageModules).sort();
}
