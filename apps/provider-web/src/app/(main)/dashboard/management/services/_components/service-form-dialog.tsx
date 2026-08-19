"use client";

import { useEffect, useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Sparkles } from "lucide-react";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import {
  createProviderService,
  type ProviderBranch,
  type ProviderService,
  type ProviderServiceInput,
  type ServiceCategory,
  updateProviderService,
} from "../_data/service-data";

const moneyPattern = /^\d+(?:\.\d{1,2})?$/;
const formSchema = z.object({
  branchId: z.string(),
  categoryId: z.string().trim().regex(/^\d+$/, "Select a category."),
  code: z.string().trim().max(100),
  description: z.string().trim().max(2000),
  dpAmount: z
    .string()
    .trim()
    .refine((value) => !value || moneyPattern.test(value), "Enter a valid amount."),
  duration: z.string().trim().regex(/^\d+$/, "Duration must be a whole number of minutes."),
  includes: z.string().trim().max(2000),
  isQueueEnabled: z.boolean(),
  isScheduledEnabled: z.boolean(),
  price: z.string().trim().regex(moneyPattern, "Enter a valid non-negative price."),
  requiresDp: z.boolean(),
  subcategoryId: z.string().trim().regex(/^\d+$/, "Select a subcategory."),
  title: z.string().trim().min(1, "Service name is required.").max(255),
});

type FormValues = z.infer<typeof formSchema>;

interface ServiceFormDialogProps {
  branches: ProviderBranch[];
  categories: ServiceCategory[];
  fixedBranchId: number | null;
  open: boolean;
  service: ProviderService | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (service: ProviderService, created: boolean) => void;
}

function defaults(
  service: ProviderService | null,
  fixedBranchId: number | null,
  categories: ServiceCategory[],
): FormValues {
  const selectedCategory = categories.find((category) => category.id === service?.category_id);
  return {
    branchId: String(fixedBranchId ?? service?.branch_ids[0] ?? ""),
    categoryId: String(selectedCategory?.parent_id ?? ""),
    code: service?.code ?? "",
    description: service?.description ?? "",
    dpAmount: String(service?.dp_amount ?? 0),
    duration: String(service?.estimated_duration ?? 60),
    includes: service?.includes ?? "",
    isQueueEnabled: service?.is_queue_enabled ?? false,
    isScheduledEnabled: service?.is_scheduled_enabled ?? true,
    price: String(service?.price ?? 0),
    requiresDp: service?.requires_dp ?? false,
    subcategoryId: String(selectedCategory?.parent_id ? selectedCategory.id : ""),
    title: service?.title ?? "",
  };
}

function payload(values: FormValues, service: ProviderService | null, category: ServiceCategory): ProviderServiceInput {
  const duration = Number(values.duration);
  return {
    additional_services: service?.additional_services ?? [],
    branch_ids: [Number(values.branchId)],
    category: category.name,
    category_id: category.id,
    code: values.code,
    description: values.description,
    dp_amount: values.requiresDp ? Number(values.dpAmount || 0) : 0,
    estimated_duration: duration,
    gallery_object_ids: service?.gallery_object_ids ?? [],
    holidays: service?.holidays ?? [],
    includes: values.includes,
    is_queue_enabled: values.isQueueEnabled,
    is_scheduled_enabled: values.isScheduledEnabled,
    maximum_duration: duration,
    minimum_duration: duration,
    payment_policy: service?.payment_policy ?? "pay_at_salon",
    price: Number(values.price),
    price_type: service?.price_type ?? "fixed",
    requires_dp: values.requiresDp,
    slots: service?.slots ?? [],
    slug: service?.slug ?? "",
    status: service?.status ?? "active",
    title: values.title,
    video_url: service?.video_url ?? "",
  };
}

export function ServiceFormDialog({
  branches,
  categories,
  fixedBranchId,
  open,
  service,
  onOpenChange,
  onSaved,
}: ServiceFormDialogProps) {
  const isEditing = Boolean(service);
  const form = useForm<FormValues>({
    defaultValues: defaults(service, fixedBranchId, categories),
    resolver: zodResolver(formSchema),
  });
  const reset = form.reset;
  const requiresDp = form.watch("requiresDp");
  const selectedCategoryId = form.watch("categoryId");
  const selectedSubcategoryId = form.watch("subcategoryId");
  const selectedBranchId = form.watch("branchId");
  const serverError = form.formState.errors.root?.message;
  const categoryOptions = useMemo(
    () => categories.filter((category) => category.parent_id === null).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const subcategoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.parent_id === Number(selectedCategoryId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, selectedCategoryId],
  );
  const selectedCategoryName = categoryOptions.find((category) => category.id === Number(selectedCategoryId))?.name;
  const selectedSubcategoryName = subcategoryOptions.find(
    (category) => category.id === Number(selectedSubcategoryId),
  )?.name;
  const selectedBranchName = branches.find((branch) => branch.id === Number(selectedBranchId))?.branch_name;

  useEffect(() => {
    if (open) reset(defaults(service, fixedBranchId, categories));
  }, [categories, fixedBranchId, open, reset, service]);

  const submit = async (values: FormValues) => {
    const branchId = Number(values.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      form.setError("branchId", { message: "Select the branch that provides this service." });
      return;
    }
    const categoryId = Number(values.categoryId);
    const subcategory = categories.find(
      (item) => item.id === Number(values.subcategoryId) && item.parent_id === categoryId,
    );
    if (!subcategory) {
      form.setError("subcategoryId", { message: "Select a valid subcategory for this category." });
      return;
    }
    if (!values.isQueueEnabled && !values.isScheduledEnabled) {
      form.setError("root", { message: "Enable scheduled booking, queue booking, or both." });
      return;
    }

    form.clearErrors("root");
    try {
      const saved = service
        ? await updateProviderService(service.id, payload(values, service, subcategory))
        : await createProviderService(payload(values, null, subcategory));
      onSaved(saved, !service);
      onOpenChange(false);
      toast.add({
        description: `${saved.title} is now available in the service catalog.`,
        title: service ? "Service updated" : "Service created",
        type: "success",
      });
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "Service could not be saved.",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!form.formState.isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border bg-muted/40">
              <Sparkles className="size-4" />
            </span>
            <div>
              <DialogTitle>{isEditing ? "Edit service" : "Add service"}</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Update the catalog, pricing, and booking configuration."
                  : "Create a bookable service for this provider branch."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>Service could not be saved</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-title">Service name</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="service-title" placeholder="Hair treatment" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-category">Category</FieldLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(value) => {
                      field.onChange(value ?? "");
                      form.setValue("subcategoryId", "", { shouldDirty: true });
                    }}
                  >
                    <SelectTrigger aria-invalid={fieldState.invalid} className="w-full" id="service-category">
                      <SelectValue placeholder="Select a category">{selectedCategoryName}</SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {categoryOptions.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
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
              name="subcategoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-subcategory">Subcategory</FieldLabel>
                  <Select
                    disabled={!selectedCategoryId}
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? "")}
                  >
                    <SelectTrigger aria-invalid={fieldState.invalid} className="w-full" id="service-subcategory">
                      <SelectValue placeholder={selectedCategoryId ? "Select a subcategory" : "Select category first"}>
                        {selectedSubcategoryName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        {subcategoryOptions.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
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
              name="code"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-code">Service code</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="service-code" placeholder="SVC-001" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            {!fixedBranchId ? (
              <Controller
                control={form.control}
                name="branchId"
                render={({ field, fieldState }) => (
                  <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="service-branch">Branch</FieldLabel>
                    <Select value={field.value || null} onValueChange={(value) => field.onChange(value ?? "")}>
                      <SelectTrigger aria-invalid={fieldState.invalid} className="w-full" id="service-branch">
                        <SelectValue placeholder="Select a branch">{selectedBranchName}</SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        <SelectGroup>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={String(branch.id)}>
                              {branch.branch_name} · Branch #{branch.id}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                  </Field>
                )}
              />
            ) : null}
            <Controller
              control={form.control}
              name="price"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-price">Price (IDR)</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="service-price" inputMode="decimal" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="duration"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-duration">Duration (minutes)</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="service-duration" inputMode="numeric" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-description">Description</FieldLabel>
                  <Textarea {...field} aria-invalid={fieldState.invalid} id="service-description" rows={3} />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="includes"
              render={({ field, fieldState }) => (
                <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="service-includes">What is included</FieldLabel>
                  <Textarea {...field} aria-invalid={fieldState.invalid} id="service-includes" rows={2} />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
          </FieldGroup>

          <div className="grid gap-3 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="isScheduledEnabled"
              render={({ field }) => (
                <Field className="flex-row items-center justify-between rounded-lg border p-3">
                  <div>
                    <FieldLabel htmlFor="scheduled-booking">Scheduled booking</FieldLabel>
                    <FieldDescription>Customers can select an appointment time.</FieldDescription>
                  </div>
                  <Switch checked={field.value} id="scheduled-booking" onCheckedChange={field.onChange} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="isQueueEnabled"
              render={({ field }) => (
                <Field className="flex-row items-center justify-between rounded-lg border p-3">
                  <div>
                    <FieldLabel htmlFor="queue-booking">Queue booking</FieldLabel>
                    <FieldDescription>The service can be added to the daily queue.</FieldDescription>
                  </div>
                  <Switch checked={field.value} id="queue-booking" onCheckedChange={field.onChange} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="requiresDp"
              render={({ field }) => (
                <Field className="flex-row items-center justify-between rounded-lg border p-3 sm:col-span-2">
                  <div>
                    <FieldLabel htmlFor="requires-deposit">Require deposit</FieldLabel>
                    <FieldDescription>Collect a deposit when the customer books this service.</FieldDescription>
                  </div>
                  <Switch checked={field.value} id="requires-deposit" onCheckedChange={field.onChange} />
                </Field>
              )}
            />
          </div>

          {requiresDp ? (
            <Controller
              control={form.control}
              name="dpAmount"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="deposit-amount">Deposit amount (IDR)</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="deposit-amount" inputMode="decimal" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
          ) : null}

          <DialogFooter>
            <Button
              disabled={form.formState.isSubmitting}
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              {isEditing ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
