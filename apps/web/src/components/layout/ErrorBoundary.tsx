import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { translate } from "@/lib/i18n/store.ts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Global crash barrier. Renders a localized recovery screen instead of a
 * white page and never shows a stack trace to the user (it goes to the
 * console).
 *
 * Uses `translate()`, not `useT()`: this must not depend on the very context
 * tree that may be what broke.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] Unhandled error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg"
          >
            <Wallet className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-fg">{translate("common.errorTitle")}</h1>
          <p className="mt-2 text-sm text-fg-muted">{translate("common.errorGeneric")}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={this.reset} leftIcon={<RefreshCw className="size-4" />} fullWidth>
              {translate("common.retry")}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                window.location.assign("/");
              }}
            >
              {translate("common.notFoundAction")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
