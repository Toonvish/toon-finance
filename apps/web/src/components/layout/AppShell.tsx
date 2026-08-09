import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BottomTabBar } from "./BottomTabBar";
import { InstallPrompt } from "./InstallPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { UpdateBanner } from "./UpdateBanner";

/**
 * The authenticated app frame.
 *  - phones: sticky top bar + fixed bottom tab bar, content padded for both,
 *  - >= lg: fixed sidebar + centred content column, no top/bottom bars.
 *
 * `<main>` owns `mx-auto max-w-5xl px-gutter pt-4 pb-tabbar` — a page root
 * must not re-apply any of it (docs/spec.md §4.10): a doubled `pb-tabbar`
 * leaves a screenful of dead space under the content and strands a sticky
 * bottom bar above the tab bar instead of on it.
 *
 * `<main>` is also a growing FLEX ITEM *and* a flex column itself, so a page
 * root can say `flex-1` and fill the screen — the unbroken chain
 * `min-h-dvh` -> `<main> flex-1 flex flex-col` -> page root `flex-1` ->
 * spacer `flex-1` is what lets the sticky "Buchen" bar on `/new` sit right
 * above the tab bar instead of floating mid-screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <SideNav />
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <TopBar />
        <OfflineBanner />
        <UpdateBanner />
        {/*
          The wider desktop gutter is `--gutter`, NOT `lg:px-8`: the
          hand-written utilities in styles/index.css are emitted after
          everything Tailwind generates, so `.px-gutter` would win over
          `lg:px-8` and desktop would quietly keep the phone gutter.
        */}
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-gutter pt-4 pb-tabbar lg:pt-8 lg:[--gutter:2rem]">
          <InstallPrompt />
          {children}
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (desktop) / below the title (mobile). AT MOST one `ActionMenu`, never a row of icon buttons (docs/spec.md §4.10). */
  actions?: ReactNode;
  /** Back link / breadcrumb slot above the title. */
  above?: ReactNode;
  className?: string;
}

/** Consistent screen heading: `<PageHeader title={t("plan.title")} actions={<ActionMenu … />} />`. */
export function PageHeader({ title, description, actions, above, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:mb-6", className)}>
      {above}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
