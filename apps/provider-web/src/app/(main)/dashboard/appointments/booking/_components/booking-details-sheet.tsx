"use client";

import { CalendarDays, CircleDollarSign, Clock3, MapPin, UserRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import {
  bookingStatusLabel,
  formatBookingDate,
  formatBookingMoney,
  formatBookingTime,
  type ProviderBooking,
} from "../_data/booking-data";

interface BookingDetailsSheetProps {
  booking: ProviderBooking | null;
  error: string;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DetailItem({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium text-sm">{value}</dd>
    </div>
  );
}

function DetailSection({
  children,
  icon: Icon,
  title,
}: Readonly<{ children: React.ReactNode; icon: typeof CalendarDays; title: string }>) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm">{title}</h3>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function formatRecordDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return formatBookingDate(value.slice(0, 10));
}

export function BookingDetailsSheet({ booking, error, isLoading, open, onOpenChange }: BookingDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{booking?.booking_code ?? "Booking details"}</SheetTitle>
          <SheetDescription>Complete booking information from the Go booking service.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 px-4 pb-6">
            {isLoading && !booking ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 7 }, (_, index) => `detail-${index}`).map((key) => (
                  <Skeleton className="h-12 w-full" key={key} />
                ))}
              </div>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Booking details unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {booking ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Booking status</span>
                    <span className="font-medium">{bookingStatusLabel(booking.status)}</span>
                  </div>
                  <Badge variant="outline">{bookingStatusLabel(booking.booking_type || "appointment")}</Badge>
                </div>

                <DetailSection icon={UserRound} title="Customer">
                  <DetailItem label="Customer name" value={booking.customer_name ?? "Walk-in customer"} />
                  <DetailItem label="Phone number" value={booking.customer_phone ?? "Not provided"} />
                  <DetailItem label="Customer ID" value={booking.customer_id ? `#${booking.customer_id}` : "Guest"} />
                  <DetailItem label="Participants" value={String(booking.participant_count || 1)} />
                </DetailSection>
                <Separator />

                <DetailSection icon={CalendarDays} title="Schedule">
                  <DetailItem label="Booking date" value={formatBookingDate(booking.booking_date)} />
                  <DetailItem label="Start time" value={formatBookingTime(booking.starts_at)} />
                  <DetailItem label="End time" value={formatBookingTime(booking.ends_at)} />
                  <DetailItem label="Duration" value={`${booking.total_duration || 0} minutes`} />
                </DetailSection>
                <Separator />

                <DetailSection icon={MapPin} title="Assignment">
                  <DetailItem
                    label="Branch"
                    value={booking.branch_id ? `Branch #${booking.branch_id}` : "Provider-wide"}
                  />
                  <DetailItem label="Staff" value={booking.staff_id ? `Staff #${booking.staff_id}` : "Not assigned"} />
                  <DetailItem
                    label="Queue number"
                    value={booking.queue_number ? `#${booking.queue_number}` : "Not queued"}
                  />
                  <DetailItem label="Provider ID" value={`#${booking.provider_id}`} />
                </DetailSection>
                <Separator />

                <DetailSection icon={CircleDollarSign} title="Payment">
                  <DetailItem
                    label="Booking value"
                    value={formatBookingMoney(booking.total_price_minor, booking.currency)}
                  />
                  <DetailItem label="Payment type" value={bookingStatusLabel(booking.payment_type || "unassigned")} />
                  <DetailItem
                    label="Amount paid"
                    value={formatBookingMoney(booking.payment_amount_minor, booking.currency)}
                  />
                  <DetailItem label="Deposit" value={formatBookingMoney(booking.dp_amount_minor, booking.currency)} />
                </DetailSection>
                <Separator />

                <DetailSection icon={Clock3} title="Additional information">
                  <DetailItem label="Notes" value={booking.notes ?? "No booking notes"} />
                  <DetailItem label="Created" value={formatRecordDate(booking.created_at)} />
                  <DetailItem label="Last updated" value={formatRecordDate(booking.updated_at)} />
                </DetailSection>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
