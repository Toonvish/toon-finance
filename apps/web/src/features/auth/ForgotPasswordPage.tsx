import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Mail } from "lucide-react";
import { ForgotPasswordRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";
import { useRequestPasswordReset } from "./lib/queries";

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
    <AuthLayout title={t("auth.forgot.title")} description={t("auth.forgot.subtitle")}>
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
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
