import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DisplayNameSchema } from "@toon/shared";
import { updateProfile } from "@/lib/api";
import { useT } from "@/lib/i18n/I18nProvider.tsx";
import { invalidate } from "@/lib/queries";
import { useCurrentUser } from "@/lib/session";
import { apiFieldErrors, clearField, type FieldErrors } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

/** Name + e-mail (read-only). `/settings`, docs/spec.md §4.9. */
export function ProfileCard() {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [name, setName] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: (value: string) => updateProfile({ name: value }),
    onSuccess: () => {
      void invalidate.me(queryClient);
      toast.success(t("settings.profile.saved"));
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });

  const currentValue = name ?? user.name;
  const dirty = currentValue.trim().length > 0 && currentValue !== user.name;

  return (
    <Card>
      <CardHeader title={t("settings.profile.title")} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          const result = DisplayNameSchema.safeParse(currentValue);
          if (!result.success) {
            setErrors({ name: t("settings.profile.name") });
            return;
          }
          setErrors({});
          mutation.mutate(result.data);
        }}
      >
        {errors._form ? <ErrorState inline description={errors._form} /> : null}
        <Input
          label={t("settings.profile.name")}
          value={currentValue}
          error={errors.name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setErrors((current) => clearField(current, "name"));
          }}
        />
        <Input label={t("settings.profile.email")} value={user.email} disabled />
        <Button type="submit" disabled={!dirty} loading={mutation.isPending}>
          {t("common.save")}
        </Button>
      </form>
    </Card>
  );
}
