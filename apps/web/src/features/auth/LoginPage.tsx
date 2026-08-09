import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Mail, Wallet } from "lucide-react";
import { LoginRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { safeNextPath, useGoTo, useSearchParams } from "@/lib/navigation";
import { useLogin, useSession } from "@/lib/session";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";

/** Shared shell of every public auth screen: centred card, app mark, title. */
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

/** `/login` — e-mail + password, the only sign-in method (docs/spec.md §1.2 #4). */
export function LoginPage() {
  const t = useT();
  const search = useSearchParams();
  const next = safeNextPath(search.next);
  const goTo = useGoTo();
  const { isAuthenticated, isLoading } = useSession();
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Already signed in? Skip the form.
  useEffect(() => {
    if (!isLoading && isAuthenticated) goTo(next, { replace: true });
  }, [isLoading, isAuthenticated, next, goTo]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(LoginRequestSchema, { email, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    login.mutate(result.data, {
      onSuccess: () => goTo(next, { replace: true }),
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <AuthCard title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {/* `?reset=1` is set by ResetPasswordPage: the reset revoked every session,
          so landing here and being asked to sign in again is expected. */}
      {search.reset === "1" ? (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-card border border-success/30 bg-success-soft p-3 text-sm text-success-soft-fg"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("auth.login.resetDone")}
        </p>
      ) : null}

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

        <div className="flex flex-col gap-1.5">
          <PasswordInput
            label={t("auth.login.password")}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            error={errors.password}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
              setErrors((current) => clearField(current, "password"));
            }}
          />
          <Link to="/password/forgot" className="self-end text-sm font-medium text-brand underline-offset-2 hover:underline">
            {t("auth.login.forgot")}
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={login.isPending}>
          {t("auth.login.submit")}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-fg-muted">
        <Link
          to="/register"
          search={next === "/" ? {} : { next }}
          className="font-semibold text-brand underline-offset-2 hover:underline"
        >
          {t("auth.login.toRegister")}
        </Link>
      </p>
    </AuthCard>
  );
}

export default LoginPage;
