"use client";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { parseProviderUser, providerAccountScope } from "@/lib/provider-auth";

const formSchema = z.object({
  email: z.email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  remember: z.boolean().optional(),
});

interface LoginPayload {
  errors?: Record<string, string[] | string>;
  message?: string;
  user?: unknown;
}

function errorMessage(payload: LoginPayload | null, status: number) {
  if (status === 401) return "The email or password is incorrect.";
  if (payload?.errors) {
    const first = Object.values(payload.errors).flat()[0];
    if (first) return first;
  }
  return payload?.message ?? "Login could not be completed. Please try again.";
}

function destinationAfterLogin() {
  const requested = new URLSearchParams(window.location.search).get("next");
  if (requested?.startsWith("/") && !requested.startsWith("//")) return requested;
  return "/dashboard/default";
}

export function LoginForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    form.clearErrors("root");

    try {
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({
          email: data.email.trim(),
          password: data.password,
          remember: Boolean(data.remember),
          role: "provider",
        }),
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as LoginPayload | null;

      if (!response.ok) {
        form.setError("root", { message: errorMessage(payload, response.status) });
        return;
      }

      const user = parseProviderUser(payload?.user);
      if (!user) {
        await fetch("/api/auth/logout", {
          body: "{}",
          credentials: "include",
          headers: { "content-type": "application/json" },
          method: "POST",
        }).catch(() => null);
        form.setError("root", { message: "This login is not an active provider account." });
        return;
      }

      const scope = providerAccountScope(user);
      toast.add({
        title: `Welcome back, ${user.name}`,
        description: `${scope.label} workspace connected.`,
      });
      router.replace(destinationAfterLogin());
      router.refresh();
    } catch {
      form.setError("root", { message: "The login service is currently unreachable. Please try again." });
    }
  };

  const rootError = form.formState.errors.root?.message;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Controller
          control={form.control}
          name="email"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          render={({ field, fieldState }) => (
            <Field className="gap-1.5" data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Input
                {...field}
                id="login-password"
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="remember"
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <Checkbox
                id="login-remember"
                name={field.name}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                aria-invalid={fieldState.invalid}
              />
              <FieldContent>
                <FieldLabel htmlFor="login-remember" className="font-normal">
                  Remember me for 30 days
                </FieldLabel>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </FieldContent>
            </Field>
          )}
        />
      </FieldGroup>
      {rootError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <Spinner /> : null}
        {form.formState.isSubmitting ? "Signing in..." : "Login"}
      </Button>
    </form>
  );
}
