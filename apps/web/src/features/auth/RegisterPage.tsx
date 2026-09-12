import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, User } from "lucide-react";
import { RegisterRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { safeNextPath, useGoTo, useSearchParams } from "@/lib/navigation";
import { useRegister, useSession } from "@/lib/session";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input, PasswordInput } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";
import { useInvitePreview } from "./lib/queries";

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

  // A claim invite already knows what the household calls this person — offer
  // that as the account name, but only while the field is still untouched.
  const claimsDisplayName = invitePreview.data?.claimsDisplayName ?? null;
  useEffect(() => {
    if (claimsDisplayName !== null) setName((current) => (current.length === 0 ? claimsDisplayName : current));
  }, [claimsDisplayName]);

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
    <AuthLayout title={t("auth.register.title")} description={t("auth.register.subtitle")}>
      {inviteToken && invitePreview.data ? (
        <p className="mb-4 rounded-card border border-brand/30 bg-brand-soft p-3 text-sm text-brand-soft-fg">
          {invitePreview.data.claimsDisplayName !== null
            ? t("auth.register.claimHint", {
                display: invitePreview.data.claimsDisplayName,
                household: invitePreview.data.householdName,
              })
            : t("auth.register.inviteHint", { household: invitePreview.data.householdName })}
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
    </AuthLayout>
  );
}

export default RegisterPage;
