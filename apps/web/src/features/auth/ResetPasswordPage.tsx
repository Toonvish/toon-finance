import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { ResetPasswordRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { isApiError } from "@/lib/api";
import { useSearchParams } from "@/lib/navigation";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PasswordInput } from "@/components/ui/Input";
import { useResetPassword } from "./lib/queries";

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
 * `/password/reset?token=` — spends a mailed reset token. On success EVERY
 * session of that account is gone, so the screen does not sign the user in:
 * it sends them to `/login?reset=1` (docs/spec.md §3.4).
 */
export function ResetPasswordPage() {
  const t = useT();
  const search = useSearchParams();
  const token = search.token;
  const navigate = useNavigate();
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setInvalid(true);
      return;
    }
    const result = validate(ResetPasswordRequestSchema, { token, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    resetPassword.mutate(result.data, {
      onSuccess: () => {
        void navigate({ to: "/login", search: { reset: "1" }, replace: true });
      },
      onError: (error) => {
        if (isApiError(error) && error.code === "reset_token_invalid") {
          setInvalid(true);
          return;
        }
        setErrors(apiFieldErrors(error));
      },
    });
  }

  if (!token || invalid) {
    return (
      <AuthCard title={t("auth.reset.title")} subtitle={t("auth.reset.invalid")}>
        <Link to="/password/forgot" className="block">
          <Button fullWidth>{t("auth.forgot.submit")}</Button>
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.reset.title")} subtitle="">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {errors._form ? <ErrorState inline description={errors._form} /> : null}
        <PasswordInput
          label={t("auth.reset.password")}
          name="password"
          autoComplete="new-password"
          required
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "password"));
          }}
        />
        <Button type="submit" size="lg" fullWidth loading={resetPassword.isPending}>
          {t("auth.reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

export default ResetPasswordPage;
