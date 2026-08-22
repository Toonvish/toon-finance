import { Link } from "@tanstack/react-router";
import type { PlanResponse } from "@toon/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { useRunPlan } from "../lib/queries";

/**
 * The plan's card on `/` (docs/spec.md §4.3). Fixkosten now also has its own
 * tab (`nav-items.ts`), so this is no longer the ONLY door to `/plan` on a
 * phone — but it stays, because the plan's monthly figure belongs next to the
 * balance it moves, and because "1 Monat offen · Jetzt buchen" has to be
 * visible without navigating anywhere.
 *
 * It is the app's only GOLD surface, and gold means exactly one thing:
 * the fixed-cost plan. Petrol is the brand, gold is the plan — a gold card
 * anywhere else would make both meaningless.
 *
 * The clickable area is a real `<Link>`, but the "Jetzt buchen" action sits
 * OUTSIDE it (a `<button>` nested in an `<a>` is invalid HTML and would fire
 * both handlers on tap).
 */
export function FixedCostCard({
  householdId,
  plan,
  isLoading,
  otherName,
}: {
  householdId: string;
  plan: PlanResponse | undefined;
  isLoading: boolean;
  otherName: string;
}) {
  const t = useT();
  const toast = useToast();
  const runPlanMutation = useRunPlan(householdId);

  if (isLoading || !plan) {
    return (
      <Card tone="accent" padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-2 p-4 sm:p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
      </Card>
    );
  }

  const pendingCount = plan.pendingPeriods.length;

  async function runNow() {
    try {
      const result = await runPlanMutation.mutateAsync({});
      if (result.bookedPeriods.length > 0) {
        toast.success(t("plan.toast.run", { count: result.bookedPeriods.length }));
      } else {
        toast.toast({ title: t("plan.toast.nothingToDo") });
      }
    } catch (error) {
      toast.fromError(error);
    }
  }

  return (
    <Card tone="accent" padding="none" className="overflow-hidden" interactive>
      <Link to="/plan" className="block p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-accent-soft-fg uppercase">{t("plan.title")}</p>
            {plan.plan.enabled && plan.current ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                  {formatCurrency(plan.current.bookableCents)}
                </p>
                <p className="mt-0.5 text-sm text-accent-soft-fg">
                  {t("plan.shareOther", { name: otherName })} ·{" "}
                  {formatPercent(plan.current.quoteNumerator, plan.current.quoteDenominator)}
                </p>
              </>
            ) : !plan.plan.enabled ? (
              <p className="mt-1 text-sm text-accent-soft-fg">{t("plan.disabledHint")}</p>
            ) : (
              <p className="mt-1 text-sm text-accent-soft-fg">{t("plan.error.incomplete")}</p>
            )}
          </div>
          {plan.plan.lastBookedPeriod ? (
            <Badge variant="neutral" className="shrink-0">
              {t("plan.lastBooked", { period: plan.plan.lastBookedPeriod })}
            </Badge>
          ) : null}
        </div>
      </Link>

      {pendingCount > 0 ? (
        <div className="flex flex-col gap-2 border-t border-accent-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg">{t("plan.pendingNotice", { count: pendingCount })}</p>
          <Button
            size="sm"
            loading={runPlanMutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void runNow();
            }}
          >
            {t("plan.run")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
