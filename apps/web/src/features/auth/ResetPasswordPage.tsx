import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ResetPasswordRequestSchema } from "@toon/shared";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { isApiError } from "@/lib/api";
import { useSearchParams } from "@/lib/navigation";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PasswordInput } from "@/components/ui/Input";
import { AuthLayout } from "./AuthLayout";
import { useResetPassword } from "./lib/queries";

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
      <AuthLayout title={t("auth.reset.title")} description={t("auth.reset.invalid")}>
        <Link to="/password/forgot" className="block">
          <Button fullWidth>{t("auth.forgot.submit")}</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.reset.title")} description="">
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
    </AuthLayout>
  );
}

export default ResetPasswordPage;
