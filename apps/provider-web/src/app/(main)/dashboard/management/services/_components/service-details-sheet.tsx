"use client";

import { Building2, CalendarClock, CircleDollarSign, ListChecks, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { formatServiceMoney, type ProviderService, serviceLabel } from "../_data/service-data";

interface ServiceDetailsSheetProps {
  open: boolean;
  service: ProviderService | null;
  onEdit: (service: ProviderService) => void;
  onOpenChange: (open: boolean) => void;
}

function Detail({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

export function ServiceDetailsSheet({ open, service, onEdit, onOpenChange }: ServiceDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/40">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{service?.title ?? "Service details"}</SheetTitle>
              <SheetDescription>{service?.code ?? "Provider service record"}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {service ? (
          <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={service.status === "active" ? "default" : "secondary"}>
                {serviceLabel(service.status)}
              </Badge>
              <Badge variant="outline">{serviceLabel(service.verify_status)}</Badge>
              <Badge variant="outline">{service.category_text}</Badge>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <CircleDollarSign className="size-4 text-muted-foreground" />
                Pricing
              </div>
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <Detail label="Price" value={formatServiceMoney(service.price)} />
                <Detail label="Price type" value={serviceLabel(service.price_type)} />
                <Detail label="Deposit required" value={service.requires_dp ? "Yes" : "No"} />
                <Detail label="Deposit amount" value={formatServiceMoney(service.dp_amount)} />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <CalendarClock className="size-4 text-muted-foreground" />
                Booking configuration
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label="Duration" value={`${service.estimated_duration} minutes`} />
                <Detail
                  label="Duration range"
                  value={`${service.minimum_duration}–${service.maximum_duration} minutes`}
                />
                <Detail label="Scheduled booking" value={service.is_scheduled_enabled ? "Enabled" : "Disabled"} />
                <Detail label="Queue booking" value={service.is_queue_enabled ? "Enabled" : "Disabled"} />
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <ListChecks className="size-4 text-muted-foreground" />
                Service information
              </div>
              <Detail label="Description" value={service.description ?? "No description provided."} />
              <Detail label="What is included" value={service.includes ?? "No inclusions provided."} />
              <Detail label="Payment policy" value={serviceLabel(service.payment_policy)} />
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Building2 className="size-4 text-muted-foreground" />
                Branch availability
              </div>
              <div className="flex flex-wrap gap-2">
                {service.branch_ids.length ? (
                  service.branch_ids.map((branchId) => (
                    <Badge key={branchId} variant="outline">
                      Branch #{branchId}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">Provider-wide</Badge>
                )}
              </div>
            </section>
          </div>
        ) : null}

        <SheetFooter className="border-t">
          <Button
            disabled={!service}
            onClick={() => {
              if (!service) return;
              onOpenChange(false);
              onEdit(service);
            }}
          >
            Edit service
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
