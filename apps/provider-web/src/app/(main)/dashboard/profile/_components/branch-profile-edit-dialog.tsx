"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { BranchProfilePayload } from "./profile-data";

const weekdayValues = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const weekdayItems = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
  { label: "Sun", value: "sunday" },
] as const;
const branchTypeItems = [
  { label: "Physical location", value: "physical" },
  { label: "Hybrid service", value: "hybrid" },
  { label: "Mobile service", value: "mobile" },
];
const branchTypeValues = ["physical", "hybrid", "mobile"] as const;
const baseTimezoneItems = [
  { label: "Western Indonesia (WIB)", value: "Asia/Jakarta" },
  { label: "Central Indonesia (WITA)", value: "Asia/Makassar" },
  { label: "Eastern Indonesia (WIT)", value: "Asia/Jayapura" },
];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const formSchema = z
  .object({
    branchName: z.string().trim().min(1, "Branch name is required.").max(255),
    description: z.string().trim().max(2000, "Description must not exceed 2,000 characters."),
    branchType: z.enum(branchTypeValues),
    timezone: z.string().trim().min(1, "Timezone is required.").max(64),
    openedAt: z.string().regex(datePattern, "Enter a valid opening date."),
    email: z.email("Enter a valid branch email address.").max(255),
    phoneCode: z.string().trim().min(1, "Country code is required.").max(20),
    phoneNumber: z.string().trim().min(1, "Phone number is required.").max(30),
    address: z.string().trim().min(1, "Address is required.").max(2000),
    country: z.string().trim().min(1, "Country is required.").max(255),
    state: z.string().trim().min(1, "Province or state is required.").max(255),
    city: z.string().trim().min(1, "City is required.").max(255),
    zipCode: z.string().trim().min(1, "Postal code is required.").max(20),
    workingStartHour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time."),
    workingEndHour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time."),
    workingDays: z.array(z.enum(weekdayValues)).min(1, "Select at least one operating day."),
    holidays: z
      .string()
      .refine(
        (value) => parseHolidays(value).every((date) => datePattern.test(date)),
        "Enter closure dates as YYYY-MM-DD, one per line.",
      ),
  })
  .refine((value) => value.workingEndHour > value.workingStartHour, {
    message: "Closing time must be later than opening time.",
    path: ["workingEndHour"],
  });

type FormValues = z.infer<typeof formSchema>;

export type ProfileEditSection = "overview" | "contact" | "operations" | "closures";

const sectionCopy: Record<
  ProfileEditSection,
  { description: string; saveLabel: string; successDescription: string; successTitle: string; title: string }
> = {
  overview: {
    title: "Edit overview information",
    description: "Update the branch identity, description, service model, and opening date.",
    saveLabel: "Save overview",
    successTitle: "Overview updated",
    successDescription: "The latest branch identity is now shown throughout the profile.",
  },
  contact: {
    title: "Edit contact information",
    description: "Update the customer-facing branch email and telephone details.",
    saveLabel: "Save contact",
    successTitle: "Contact information updated",
    successDescription: "The latest public email and telephone details are now shown on the profile.",
  },
  operations: {
    title: "Edit operating information",
    description: "Update the branch location, timezone, daily hours, and normal weekly operating days.",
    saveLabel: "Save operations",
    successTitle: "Operating information updated",
    successDescription: "The latest location and weekly operating schedule are now shown on the profile.",
  },
  closures: {
    title: "Manage closure dates",
    description: "Add or remove full-day closures without changing the normal weekly schedule.",
    saveLabel: "Save closures",
    successTitle: "Closure calendar updated",
    successDescription: "The latest scheduled closure dates are now shown on the profile.",
  },
};

interface BranchProfileEditDialogProps {
  open: boolean;
  payload: BranchProfilePayload;
  section: ProfileEditSection;
  onOpenChange: (open: boolean) => void;
  onSaved: (payload: BranchProfilePayload) => void;
}

interface BranchProfileUpdateResponse {
  data?: BranchProfilePayload;
  message?: string;
}

function parseHolidays(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function defaultValues(payload: BranchProfilePayload): FormValues {
  const { account, branch } = payload;
  return {
    branchName: branch.branch_name,
    description: branch.description,
    branchType: branchTypeValues.includes(branch.branch_type as FormValues["branchType"])
      ? (branch.branch_type as FormValues["branchType"])
      : "physical",
    timezone: branch.timezone || "Asia/Jakarta",
    openedAt: branch.opened_at ?? branch.created_at.slice(0, 10),
    email: branch.email ?? account.email,
    phoneCode: branch.phone_code,
    phoneNumber: branch.phone_number ?? "",
    address: branch.address ?? "",
    country: branch.country_id ?? "",
    state: branch.state_id ?? "",
    city: branch.city_id ?? "",
    zipCode: branch.zip_code ?? "",
    workingStartHour: branch.working_start_hour.slice(0, 5),
    workingEndHour: branch.working_end_hour.slice(0, 5),
    workingDays: branch.working_days.filter((day): day is FormValues["workingDays"][number] =>
      weekdayValues.includes(day as FormValues["workingDays"][number]),
    ),
    holidays: branch.holidays.join("\n"),
  };
}

export function BranchProfileEditDialog({
  open,
  payload,
  section,
  onOpenChange,
  onSaved,
}: BranchProfileEditDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(payload),
  });
  const serverError = form.formState.errors.root?.message;
  const timezoneItems = baseTimezoneItems.some((item) => item.value === payload.branch.timezone)
    ? baseTimezoneItems
    : [{ label: payload.branch.timezone, value: payload.branch.timezone }, ...baseTimezoneItems];
  const copy = sectionCopy[section];

  useEffect(() => {
    if (open) form.reset(defaultValues(payload));
  }, [form, open, payload]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (form.formState.isSubmitting) return;
    if (nextOpen) form.reset(defaultValues(payload));
    onOpenChange(nextOpen);
  };

  const submit = async (values: FormValues) => {
    form.clearErrors("root");
    try {
      const response = await fetch("/api/provider/branch-profile", {
        method: "PUT",
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          branch_name: values.branchName,
          description: values.description,
          branch_type: values.branchType,
          timezone: values.timezone,
          opened_at: values.openedAt,
          email: values.email,
          phone_code: values.phoneCode,
          phone_number: values.phoneNumber,
          address: values.address,
          country_id: values.country,
          state_id: values.state,
          city_id: values.city,
          zip_code: values.zipCode,
          working_start_hour: values.workingStartHour,
          working_end_hour: values.workingEndHour,
          working_days: values.workingDays,
          holidays: parseHolidays(values.holidays),
        }),
      });
      const result = (await response.json().catch(() => null)) as BranchProfileUpdateResponse | null;
      if (!response.ok || !result?.data) {
        throw new Error(result?.message ?? "The branch profile could not be saved.");
      }
      onSaved(result.data);
      onOpenChange(false);
      toast.add({
        title: copy.successTitle,
        description: copy.successDescription,
        type: "success",
      });
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "The branch profile could not be saved.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description} Your sign-in account and permissions stay unchanged.</DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-col gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
          <div className="scroll-fade min-h-0 overflow-y-auto pr-1">
            <FieldGroup className="gap-6">
              {serverError ? (
                <Alert variant="destructive">
                  <AlertTitle>Profile could not be saved</AlertTitle>
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              ) : null}

              {section === "overview" ? (
                <FieldSet>
                  <FieldLegend>Profile</FieldLegend>
                  <FieldDescription>Information shown as the identity of this branch.</FieldDescription>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="branchName"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-name">Branch name</FieldLabel>
                          <Input {...field} id="branch-profile-name" aria-invalid={fieldState.invalid} />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="description"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-description">About this branch</FieldLabel>
                          <Textarea
                            {...field}
                            id="branch-profile-description"
                            aria-invalid={fieldState.invalid}
                            rows={4}
                          />
                          <FieldDescription>{field.value.length}/2,000 characters</FieldDescription>
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="branchType"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-type">Branch type</FieldLabel>
                          <Select items={branchTypeItems} value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              className="w-full"
                              id="branch-profile-type"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start" alignItemWithTrigger={false}>
                              <SelectGroup>
                                {branchTypeItems.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="openedAt"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-opened-at">Opening date</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-opened-at"
                            type="date"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {section === "contact" ? (
                <FieldSet>
                  <FieldLegend>Contact</FieldLegend>
                  <FieldDescription>Only customer-facing email and telephone information.</FieldDescription>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="email"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-email">Branch email</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-email"
                            type="email"
                            autoComplete="email"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="phoneCode"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-phone-code">Country code</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-phone-code"
                            inputMode="tel"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="phoneNumber"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-phone-number">Phone number</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-phone-number"
                            inputMode="tel"
                            autoComplete="tel"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {section === "operations" ? (
                <FieldSet>
                  <FieldLegend>Location</FieldLegend>
                  <FieldDescription>
                    Location details used by branch discovery and day-to-day operations.
                  </FieldDescription>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="address"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-address">Street address</FieldLabel>
                          <Textarea {...field} id="branch-profile-address" aria-invalid={fieldState.invalid} rows={3} />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    {(
                      [
                        ["country", "Country"],
                        ["state", "Province / state"],
                        ["city", "City"],
                        ["zipCode", "Postal code"],
                      ] as const
                    ).map(([name, label]) => (
                      <Controller
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`branch-profile-${name}`}>{label}</FieldLabel>
                            <Input {...field} id={`branch-profile-${name}`} aria-invalid={fieldState.invalid} />
                            {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                          </Field>
                        )}
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {section === "operations" ? (
                <FieldSet>
                  <FieldLegend>Operations</FieldLegend>
                  <FieldDescription>
                    Opening hours, active days, and timezone for the normal weekly schedule.
                  </FieldDescription>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={form.control}
                      name="timezone"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-timezone">Timezone</FieldLabel>
                          <Select items={timezoneItems} value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger
                              className="w-full"
                              id="branch-profile-timezone"
                              aria-invalid={fieldState.invalid}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start" alignItemWithTrigger={false}>
                              <SelectGroup>
                                {timezoneItems.map((item) => (
                                  <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="workingStartHour"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-start-hour">Opening time</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-start-hour"
                            type="time"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="workingEndHour"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-end-hour">Closing time</FieldLabel>
                          <Input
                            {...field}
                            id="branch-profile-end-hour"
                            type="time"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                    <Controller
                      control={form.control}
                      name="workingDays"
                      render={({ field, fieldState }) => (
                        <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                          <FieldLabel id="branch-profile-working-days">Operating days</FieldLabel>
                          <ToggleGroup
                            multiple
                            className="flex-wrap"
                            value={field.value}
                            onValueChange={field.onChange}
                            aria-labelledby="branch-profile-working-days"
                            variant="outline"
                          >
                            {weekdayItems.map((item) => (
                              <ToggleGroupItem key={item.value} value={item.value} aria-label={item.value}>
                                {item.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              ) : null}

              {section === "closures" ? (
                <FieldSet>
                  <FieldLegend>Scheduled closures</FieldLegend>
                  <FieldDescription>
                    The branch is unavailable for the full day on each configured date.
                  </FieldDescription>
                  <FieldGroup>
                    <Controller
                      control={form.control}
                      name="holidays"
                      render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="branch-profile-holidays">Closure dates</FieldLabel>
                          <Textarea
                            {...field}
                            id="branch-profile-holidays"
                            aria-invalid={fieldState.invalid}
                            placeholder={"2026-12-25\n2027-01-01"}
                            rows={8}
                          />
                          <FieldDescription>Enter one date per line in YYYY-MM-DD format.</FieldDescription>
                          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                        </Field>
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
              ) : null}
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
              {form.formState.isSubmitting ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {form.formState.isSubmitting ? "Saving..." : copy.saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
