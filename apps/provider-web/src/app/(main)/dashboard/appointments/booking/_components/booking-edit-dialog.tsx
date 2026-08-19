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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { type ProviderBooking, updateProviderBooking } from "../_data/booking-data";

const formSchema = z.object({
  customerName: z.string().trim().max(255, "Customer name must not exceed 255 characters."),
  customerPhone: z.string().trim().max(30, "Phone number must not exceed 30 characters."),
  notes: z.string().trim().max(2000, "Notes must not exceed 2,000 characters."),
});

type FormValues = z.infer<typeof formSchema>;

interface BookingEditDialogProps {
  booking: ProviderBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (booking: ProviderBooking) => void;
}

function defaultValues(booking: ProviderBooking | null): FormValues {
  return {
    customerName: booking?.customer_name ?? "",
    customerPhone: booking?.customer_phone ?? "",
    notes: booking?.notes ?? "",
  };
}

export function BookingEditDialog({ booking, open, onOpenChange, onSaved }: BookingEditDialogProps) {
  const form = useForm<FormValues>({
    defaultValues: defaultValues(booking),
    resolver: zodResolver(formSchema),
  });
  const serverError = form.formState.errors.root?.message;
  const resetForm = form.reset;

  useEffect(() => {
    if (open) resetForm(defaultValues(booking));
  }, [booking, open, resetForm]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (form.formState.isSubmitting) return;
    onOpenChange(nextOpen);
  };

  const submit = async (values: FormValues) => {
    if (!booking) return;
    form.clearErrors("root");
    try {
      const updated = await updateProviderBooking(booking.id, {
        customer_name: values.customerName,
        customer_phone: values.customerPhone,
        notes: values.notes,
      });
      onSaved(updated);
      onOpenChange(false);
      toast.add({
        description: `${updated.booking_code} now shows the latest customer information and notes.`,
        title: "Booking updated",
        type: "success",
      });
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "Booking details could not be saved.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Update customer-facing information for {booking?.booking_code ?? "this booking"}. Schedule, status, and
            payment stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            {serverError ? (
              <Alert variant="destructive">
                <AlertTitle>Booking could not be saved</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}
            <Controller
              control={form.control}
              name="customerName"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="booking-customer-name">Customer name</FieldLabel>
                  <Input {...field} aria-invalid={fieldState.invalid} id="booking-customer-name" />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="customerPhone"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="booking-customer-phone">Phone number</FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    autoComplete="tel"
                    id="booking-customer-phone"
                    inputMode="tel"
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="notes"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="booking-notes">Booking notes</FieldLabel>
                  <Textarea {...field} aria-invalid={fieldState.invalid} id="booking-notes" rows={5} />
                  <FieldDescription>{field.value.length}/2,000 characters</FieldDescription>
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <Button
              disabled={form.formState.isSubmitting}
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={form.formState.isSubmitting || !booking} type="submit">
              {form.formState.isSubmitting ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
