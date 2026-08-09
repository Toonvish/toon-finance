import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, User, Wallet } from "lucide-react";
import { RegisterRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { safeNextPath, useGoTo, useSearchParams } from "@/lib/navigation";
import { useRegister, useSession } from "@/lib/session";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";
import { useInvitePreview } from "./lib/queries";

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
 * `/register?invite=<token>` — plain e-mail/password sign-up. Without an
 * invite token this creates a brand-new household (docs/spec.md §3.4); with
 * one, it joins the household behind the token.
 */
export function RegisterPage() {
  const t = useT();
  const search = useSearchParams();
  const next = safeNextPath(search.next);
  const inviteToken = search.invite;
  const goTo = useGoTo();
  const { isAuthenticated, isLoading } = useSession();
  const register = useRegister();
  const invitePreview = useInvitePreview(inviteToken ?? "");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!isLoading && isAuthenticated) goTo(next, { replace: true });
  }, [isLoading, isAuthenticated, next, goTo]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(RegisterRequestSchema, {
      name,
      email,
      password,
      ...(inviteToken ? { inviteToken } : {}),
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    register.mutate(result.data, {
      onSuccess: () => goTo(next, { replace: true }),
      onError: (error) => setErrors(apiFieldErrors(error)),
    });
  }

  return (
    <AuthCard title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      {inviteToken && invitePreview.data ? (
        <p className="mb-4 rounded-card border border-brand/30 bg-brand-soft p-3 text-sm text-brand-soft-fg">
          {t("auth.register.inviteHint", { household: invitePreview.data.householdName })}
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {errors._form ? <ErrorState inline description={errors._form} /> : null}

        <Input
          label={t("auth.register.name")}
          name="name"
          autoComplete="name"
          required
          leftIcon={<User />}
          placeholder={t("auth.register.namePlaceholder")}
          value={name}
          error={errors.name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setErrors((current) => clearField(current, "name"));
          }}
        />

        <Input
          label={t("auth.register.email")}
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

        <PasswordInput
          label={t("auth.register.password")}
          name="password"
          autoComplete="new-password"
          required
          hint={!errors.password ? t("auth.register.passwordHint") : undefined}
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "password"));
          }}
        />

        <Button type="submit" size="lg" fullWidth loading={register.isPending}>
          {t("auth.register.submit")}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-fg-muted">
        <Link
          to="/login"
          search={next === "/" ? {} : { next }}
          className="font-semibold text-brand underline-offset-2 hover:underline"
        >
          {t("auth.register.toLogin")}
        </Link>
      </p>
    </AuthCard>
  );
}

export default RegisterPage;
