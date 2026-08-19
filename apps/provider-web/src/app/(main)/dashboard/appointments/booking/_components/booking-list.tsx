"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  CalendarCheck2,
  CalendarDays,
  CalendarIcon,
  CircleDollarSign,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { useProviderSession } from "@/components/provider-session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  bookingStatusLabel,
  formatBookingDate,
  formatBookingMoney,
  formatBookingTime,
  loadProviderBooking,
  loadProviderBookings,
  type ProviderBooking,
} from "../_data/booking-data";
import { BookingActions } from "./booking-actions";
import { BookingDetailsSheet } from "./booking-details-sheet";
import { BookingEditDialog } from "./booking-edit-dialog";

const statusOptions = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Waiting", value: "waiting" },
  { label: "Checked in", value: "checked_in" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "No show", value: "no_show" },
];

const upcomingStatuses = new Set(["pending", "confirmed", "waiting", "checked_in", "in_progress", "inprogress"]);
const cancelledStatuses = new Set([
  "cancelled",
  "customer_cancelled",
  "provider_cancelled",
  "expired_hold",
  "payment_expired",
  "no_show",
]);
const finishedStatuses = new Set(["completed", "order_completed", "refund_completed"]);
const metricSkeletonKeys = ["total", "today", "upcoming", "gross"];
const rowSkeletonKeys = ["booking-1", "booking-2", "booking-3", "booking-4", "booking-5"];

function localDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function statusVariant(status: string): "default" | "destructive" | "outline" | "secondary" {
  if (cancelledStatuses.has(status)) return "destructive";
  if (finishedStatuses.has(status)) return "secondary";
  if (status === "confirmed") return "default";
  return "outline";
}

function BookingLoading() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricSkeletonKeys.map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {rowSkeletonKeys.map((key) => (
            <Skeleton className="h-10 w-full" key={key} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  description,
  icon: Icon,
  title,
  value,
}: Readonly<{
  description: string;
  icon: typeof CalendarDays;
  title: string;
  value: string;
}>) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="font-medium text-sm">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-2xl tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function BookingDatePicker({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const [open, setOpen] = useState(false);
  const parsedDate = value ? parseISO(value) : undefined;
  const selectedDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-between font-normal data-[empty=true]:text-muted-foreground sm:w-auto"
            data-empty={!selectedDate}
            id="booking-date"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="text-muted-foreground">Date:</span>
        {selectedDate ? format(selectedDate, "MMM d, yyyy") : "All"}
        <CalendarIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={selectedDate}
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
          selected={selectedDate}
          timeZone="Asia/Jakarta"
        />
        {selectedDate ? (
          <>
            <Separator />
            <div className="p-2">
              <Button
                className="w-full"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear date filter
              </Button>
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function BookingList() {
  const { canAccess, scope } = useProviderSession();
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [date, setDate] = useState("");
  const [detailsBooking, setDetailsBooking] = useState<ProviderBooking | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editBooking, setEditBooking] = useState<ProviderBooking | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const detailsController = useRef<AbortController | null>(null);
  const hasBookingAccess = canAccess("bookings");

  const fetchBookings = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError("");
      try {
        const data = await loadProviderBookings({ date, status }, signal ?? new AbortController().signal);
        setBookings(data);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Booking data could not be loaded.");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [date, status],
  );

  useEffect(() => {
    if (!hasBookingAccess) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    void fetchBookings(controller.signal);

    return () => controller.abort();
  }, [fetchBookings, hasBookingAccess]);

  const visibleBookings = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return bookings;
    return bookings.filter((booking) =>
      [booking.booking_code, booking.customer_name, booking.customer_phone]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(term)),
    );
  }, [bookings, search]);

  const today = localDateKey();
  const todayBookings = bookings.filter((booking) => booking.booking_date === today).length;
  const upcomingBookings = bookings.filter(
    (booking) => booking.booking_date >= today && upcomingStatuses.has(booking.status),
  ).length;
  const grossValue = bookings.reduce((total, booking) => total + (Number(booking.total_price_minor) || 0), 0);

  const openDetails = useCallback((booking: ProviderBooking) => {
    detailsController.current?.abort();
    const controller = new AbortController();
    detailsController.current = controller;
    setDetailsBooking(null);
    setDetailsError("");
    setDetailsLoading(true);
    setDetailsOpen(true);
    void loadProviderBooking(booking.id, controller.signal)
      .then((freshBooking) => {
        setDetailsBooking(freshBooking);
        setBookings((current) => current.map((item) => (item.id === freshBooking.id ? freshBooking : item)));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setDetailsError(loadError instanceof Error ? loadError.message : "Booking details could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
  }, []);

  const openEdit = useCallback((booking: ProviderBooking) => {
    setEditBooking(booking);
    setEditOpen(true);
  }, []);

  const handleSaved = useCallback((updatedBooking: ProviderBooking) => {
    setBookings((current) => current.map((booking) => (booking.id === updatedBooking.id ? updatedBooking : booking)));
    setEditBooking(updatedBooking);
    setDetailsBooking((current) => (current?.id === updatedBooking.id ? updatedBooking : current));
  }, []);

  if (!hasBookingAccess) {
    return (
      <div className="min-w-0 space-y-6">
        <PageHeader isLoading={false} onRefresh={() => undefined} scopeLabel={scope.label} />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Booking access unavailable</AlertTitle>
          <AlertDescription>
            This account does not have the bookings permission for its current branch.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader isLoading={isLoading} onRefresh={() => void fetchBookings()} scopeLabel={scope.label} />

      {isLoading && bookings.length === 0 ? (
        <BookingLoading />
      ) : (
        <>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Could not load bookings</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button size="sm" variant="outline" onClick={() => void fetchBookings()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description="Current API result"
              icon={CalendarDays}
              title="Total bookings"
              value={String(bookings.length)}
            />
            <MetricCard
              description="Asia/Jakarta today"
              icon={CalendarCheck2}
              title="Today's bookings"
              value={String(todayBookings)}
            />
            <MetricCard
              description="Pending or active"
              icon={RefreshCw}
              title="Upcoming"
              value={String(upcomingBookings)}
            />
            <MetricCard
              description="Before payment adjustments"
              icon={CircleDollarSign}
              title="Gross booking value"
              value={formatBookingMoney(grossValue, bookings[0]?.currency || "IDR")}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
              <CardTitle className="text-xl leading-none">Booking records</CardTitle>
              <CardDescription>
                Showing {visibleBookings.length} of {bookings.length} bookings for {scope.label}.
              </CardDescription>
              <CardAction className="col-start-1 row-start-auto w-full justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-64 md:justify-self-end">
                <InputGroup className="h-7">
                  <InputGroupAddon align="inline-start">
                    <Search className="size-3.5" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search booking"
                    className="h-7"
                    id="booking-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search bookings..."
                    value={search}
                  />
                </InputGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="grid gap-2 px-4 sm:flex sm:flex-wrap sm:items-center">
                <Select items={statusOptions} onValueChange={(value) => setStatus(value ?? "all")} value={status}>
                  <SelectTrigger className="w-full sm:w-auto" id="booking-status" size="sm">
                    <span className="text-muted-foreground">Status:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <BookingDatePicker onChange={setDate} value={date} />

                {search || status !== "all" || date ? (
                  <Button
                    className="w-full sm:w-auto"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                      setDate("");
                    }}
                  >
                    <X data-icon="inline-start" />
                    Clear filters
                  </Button>
                ) : null}
              </div>

              {visibleBookings.length === 0 ? (
                <div className="px-4">
                  <Empty className="min-h-56 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CalendarDays />
                      </EmptyMedia>
                      <EmptyTitle>No bookings found</EmptyTitle>
                      <EmptyDescription>
                        No booking matches the current account scope and filters. Change the filters or refresh the
                        data.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <Table className="min-w-[980px] **:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                  <TableCaption className="sr-only">Bookings for {scope.label}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell>
                          <p className="font-medium">{booking.booking_code}</p>
                          <p className="text-muted-foreground text-xs">ID {booking.id}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{booking.customer_name || "Walk-in customer"}</p>
                          <p className="text-muted-foreground text-xs">{booking.customer_phone || "No phone number"}</p>
                        </TableCell>
                        <TableCell>
                          <p>{formatBookingDate(booking.booking_date)}</p>
                          <p className="text-muted-foreground text-xs">{formatBookingTime(booking.starts_at)}</p>
                        </TableCell>
                        <TableCell>
                          <p>{bookingStatusLabel(booking.booking_type || "appointment")}</p>
                          <p className="text-muted-foreground text-xs">
                            {booking.participant_count || 1} participant(s)
                          </p>
                        </TableCell>
                        <TableCell>
                          <p>{booking.branch_id ? `Branch #${booking.branch_id}` : "Provider-wide"}</p>
                          <p className="text-muted-foreground text-xs">
                            {booking.staff_id ? `Staff #${booking.staff_id}` : "Staff not assigned"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {formatBookingMoney(booking.total_price_minor, booking.currency)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {bookingStatusLabel(booking.payment_type || "unassigned")}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(booking.status)}>{bookingStatusLabel(booking.status)}</Badge>
                        </TableCell>
                        <TableCell>
                          <BookingActions booking={booking} onEdit={openEdit} onView={openDetails} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <BookingDetailsSheet
        booking={detailsBooking}
        error={detailsError}
        isLoading={detailsLoading}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            detailsController.current?.abort();
            setDetailsBooking(null);
            setDetailsError("");
            setDetailsLoading(false);
          }
        }}
      />
      <BookingEditDialog
        booking={editBooking}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditBooking(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

function PageHeader({
  isLoading,
  onRefresh,
  scopeLabel,
}: Readonly<{ isLoading: boolean; onRefresh: () => void; scopeLabel: string }>) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Booking</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Live booking records from the Go booking service for {scopeLabel}.
        </p>
      </div>
      <Button className="w-full sm:w-auto" disabled={isLoading} variant="outline" onClick={onRefresh}>
        <RefreshCw className={isLoading ? "animate-spin" : ""} />
        Refresh
      </Button>
    </div>
  );
}
