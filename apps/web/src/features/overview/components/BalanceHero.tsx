import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { BalanceResponse } from "@toon/shared";
import { AmountText } from "@/components/money/AmountText";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useT } from "@/lib/i18n/I18nProvider.tsx";

/**
 * The one number that matters (docs/spec.md §4.3): who owes whom, in words
 * and as an amount, with the "Jetzt ausgleichen" entry point and a collapsible
 * derivation of how the figure came to be.
 *
 * It is the app's only BRAND-FILLED surface — solid petrol, white figures.
 * Nothing else on `/` is allowed to take that treatment: the point is that
 * the eye lands here first, every time, before the plan card's gold and
 * before any white card. The consequence is that the usual semantic ledger
 * colours (green owed-to-you / red you-owe) cannot carry the sign here —
 * they are unreadable on petrol — so the SENTENCE carries it, which it had
 * to anyway for anyone who cannot separate the two hues.
 *
 * The API's `breakdown` (`splitOtherCents`/`forOtherCents`/`settledCents`) is
 * always expressed from `member_slot 1`'s perspective, same as `balanceCents`
 * — only `viewerBalanceCents` is negated for a slot-2 viewer
 * (`docs/spec.md §3.8`). So the three sub-totals are negated here by the same
 * factor, otherwise a slot-2 viewer would see a breakdown whose sign
 * disagrees with the headline sentence it is supposed to explain.
 */
export function BalanceHero({
  balance,
  isLoading,
  otherName,
  onSettle,
}: {
  balance: BalanceResponse | undefined;
  isLoading: boolean;
  otherName: string;
  onSettle: () => void;
}) {
  const t = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Neutral while loading, not brand-tinted: `Skeleton` paints
  // `bg-skeleton`, and a `className` override of the same property is decided
  // by Tailwind's emit order, not by the order of the class attribute — so
  // the tint would be a coin flip rather than a choice.
  if (isLoading || !balance) {
    return (
      <Card padding="lg" className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-11 w-full" rounded="sm" />
      </Card>
    );
  }

  const { viewerBalanceCents, balanceCents, breakdown, asOf } = balance;
  const settled = viewerBalanceCents === 0;
  const amountCents = Math.abs(viewerBalanceCents);

  // `balanceCents` is un-negated slot-1 truth; `viewerSign` recovers the
  // factor that turned it into `viewerBalanceCents`, so the breakdown below
  // can be expressed in the same perspective as the headline.
  const viewerSign = balanceCents === 0 || viewerBalanceCents === balanceCents ? 1 : -1;

  const sentence = settled
    ? t("balance.settled")
    : viewerBalanceCents > 0
      ? t("balance.owesYou", { name: otherName, amount: formatCurrency(amountCents) })
      : t("balance.youOwe", { name: otherName, amount: formatCurrency(amountCents) });

  return (
    <Card tone="brand" padding="lg" className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-brand-fg/70">{t("balance.asOf", { date: formatDateTime(asOf) })}</p>
        <div className="mt-2 flex flex-col items-start gap-1">
          <AmountText cents={amountCents} colorNegative={false} size="xl" className="tracking-tight" />
          <p className="text-base text-brand-fg/90">{sentence}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {!settled ? (
          <Button variant="inverse" fullWidth onClick={onSettle} className="sm:w-auto sm:px-6">
            {t("balance.settle.action")}
          </Button>
        ) : null}
        <Button
          variant="inverseOutline"
          fullWidth={settled}
          onClick={() => setDetailsOpen((value) => !value)}
          rightIcon={
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform duration-150", detailsOpen && "rotate-180")}
            />
          }
        >
          {t("balance.details")}
        </Button>
      </div>

      {detailsOpen ? (
        <dl className="flex flex-col gap-2 rounded-xl bg-brand-fg/10 p-3 text-sm text-brand-fg">
          <p className="mb-1 font-semibold">{t("balance.breakdown.title")}</p>
          <BreakdownRow label={t("balance.breakdown.split")} cents={breakdown.splitOtherCents * viewerSign} />
          <BreakdownRow
            label={t("balance.breakdown.forOther", { name: otherName })}
            cents={breakdown.forOtherCents * viewerSign}
          />
          <BreakdownRow label={t("balance.breakdown.settled")} cents={breakdown.settledCents * viewerSign} />
          <p className="mt-1 text-brand-fg/70">
            {t("balance.breakdown.count", { count: breakdown.transactionCount })}
          </p>
        </dl>
      ) : null}
    </Card>
  );
}

/** `colorNegative` is off on purpose: `--danger` on petrol fails contrast, and the sign is already in the text. */
function BreakdownRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-brand-fg/70">{label}</dt>
      <dd>
        <AmountText cents={cents} showPlusSign colorNegative={false} size="sm" />
      </dd>
    </div>
  );
}
