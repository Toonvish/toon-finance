import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Mail, Wallet } from "lucide-react";
import { ForgotPasswordRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { useRequestPasswordReset } from "./lib/queries";

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-gutter py-8">
      <Card padding="lg" className="w-full max-w-sm">
        <span
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg"
        >
          <Wallet className="size-6" />
        </span>
        <h1 className="mt-4 text-center text-xl font-semibold text-fg">{title}</h1>
        <p className="mt-1 text-center text-sm text-fg-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

/**
 * `/password/forgot` — always ends in the same confirmation, whether or not
 * the address has an account (docs/spec.md §3.4: no user enumeration). A 429
 * (rate limit) is the one outcome that is shown as an error.
 */
export function ForgotPasswordPage() {
  const t = useT();
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(ForgotPasswordRequestSchema, { email });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    requestReset.mutate(result.data, {
      onSuccess: () => setSubmitted(true),
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      {submitted ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-card border border-success/30 bg-success-soft p-3 text-sm text-success-soft-fg"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("auth.forgot.done")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {errors._form ? <ErrorState inline description={errors._form} /> : null}
          <Input
            label={t("auth.login.email")}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            leftIcon={<Mail />}
            value={email}
            error={errors.email}
            onChange={(event) => {
              setEmail(event.currentTarget.value);
              setErrors((current) => clearField(current, "email"));
            }}
          />
          <Button type="submit" size="lg" fullWidth loading={requestReset.isPending}>
            {t("auth.forgot.submit")}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-fg-muted">
        <Link to="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
          {t("auth.login.title")}
        </Link>
      </p>
    </AuthCard>
  );
}

export default ForgotPasswordPage;
