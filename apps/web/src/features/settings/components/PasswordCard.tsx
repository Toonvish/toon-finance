import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChangePasswordRequestSchema } from "@toon/shared";
import { changePassword } from "@/lib/api";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { apiFieldErrors, clearField, validate, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { PasswordInput } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

/** `/settings` — change the account's password (docs/spec.md §4.9). */
export function PasswordCard() {
  const t = useT();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => changePassword(body),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t("settings.password.changed"));
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  return (
    <Card>
      <CardHeader title={t("settings.password.title")} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const result = validate(ChangePasswordRequestSchema, { currentPassword, newPassword });
          if (!result.ok) {
            setErrors(result.errors);
            return;
          }
          setErrors({});
          mutation.mutate(result.data);
        }}
      >
        {errors._form ? <ErrorState inline description={errors._form} /> : null}
        <PasswordInput
          label={t("settings.password.current")}
          autoComplete="current-password"
          value={currentPassword}
          error={errors.currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "currentPassword"));
          }}
        />
        <PasswordInput
          label={t("settings.password.new")}
          autoComplete="new-password"
          value={newPassword}
          error={errors.newPassword}
          onChange={(event) => {
            setNewPassword(event.currentTarget.value);
            setErrors((current) => clearField(current, "newPassword"));
          }}
        />
        <Button type="submit" loading={mutation.isPending}>
          {t("settings.password.submit")}
        </Button>
      </form>
    </Card>
  );
}
