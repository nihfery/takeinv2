"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { format, parseISO } from "date-fns";
import {
  Ban,
  CalendarIcon,
  CircleCheck,
  ListOrdered,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";

import { useProviderSession } from "@/components/provider-session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { BookingDetailsSheet } from "../../booking/_components/booking-details-sheet";
import {
  bookingStatusLabel,
  formatBookingDate,
  formatBookingTime,
  loadProviderBooking,
  type ProviderBooking,
} from "../../booking/_data/booking-data";
import { loadProviderQueue, transitionProviderBooking } from "../_data/queue-data";
import type { QueueAction } from "./queue-action-data";
import { QueueActions } from "./queue-actions";

const PAGE_SIZES = [10, 20, 30];
const SKELETON_ROWS = ["row-one", "row-two", "row-three", "row-four", "row-five", "row-six"];
const SKELETON_CELLS = ["queue", "booking", "customer", "schedule", "staff", "status", "actions"];

const STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["confirmed", "Confirmed"],
  ["waiting", "Waiting"],
  ["checked_in", "Checked in"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["no_show", "No show"],
  ["pending_payment", "Pending payment"],
  ["payment_expired", "Payment expired"],
] as const;

interface PendingAction {
  booking: ProviderBooking;
  action: QueueAction;
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replaceAll("-", "_");
}

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

function statusVariant(status?: string | null): "default" | "destructive" | "outline" | "secondary" {
  const value = normalize(status);
  if (["cancelled", "customer_cancelled", "provider_cancelled", "no_show", "payment_expired"].includes(value)) {
    return "destructive";
  }
  if (["waiting", "checked_in", "in_progress", "inprogress", "completed"].includes(value)) return "secondary";
  if (value === "confirmed") return "default";
  return "outline";
}

function availableActions(booking: ProviderBooking, canManageBookings: boolean, canManageQueue: boolean) {
  const status = normalize(booking.status);
  const bookingType = normalize(booking.booking_type);
  const actions: QueueAction[] = [];

  if (["confirmed", "waiting"].includes(status)) {
    if (["queue", "walk_in"].includes(bookingType) && canManageQueue) {
      actions.push({
        description: "Mark this customer as called and checked in for service.",
        icon: UserCheck,
        label: "Call and check in",
        transition: "call",
      });
    } else if (canManageBookings) {
      actions.push({
        description: "Confirm that this customer has arrived at the branch.",
        icon: UserCheck,
        label: "Check in",
        transition: "check-in",
      });
    }
  }

  if (status === "checked_in" && canManageBookings) {
    actions.push({
      description: "Move this booking into active service.",
      icon: Play,
      label: "Start service",
      transition: "start",
    });
  }

  if (["in_progress", "inprogress"].includes(status) && canManageBookings) {
    actions.push({
      description: "Mark the booked service as completed.",
      icon: CircleCheck,
      label: "Complete service",
      transition: "complete",
    });
  }

  if (["confirmed", "waiting", "checked_in"].includes(status) && canManageBookings) {
    actions.push({
      description: "Record that the customer did not arrive for this booking.",
      destructive: true,
      icon: UserX,
      label: "Mark as no show",
      transition: "no-show",
    });
  }

  if (["confirmed", "waiting", "checked_in", "in_progress", "inprogress"].includes(status) && canManageBookings) {
    actions.push({
      description: "Cancel this booking and remove it from the active service workflow.",
      destructive: true,
      icon: Ban,
      label: "Cancel booking",
      transition: "cancel",
    });
  }

  return actions;
}

function QueueDatePicker({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const selectedDate = parseISO(value);
  return (
    <Popover>
      <PopoverTrigger render={<Button className="w-full justify-between font-normal sm:w-auto" variant="outline" />}>
        <CalendarIcon data-icon="inline-start" />
        {format(selectedDate, "MMM d, yyyy")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          onSelect={(date) => date && onChange(format(date, "yyyy-MM-dd"))}
          selected={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}

function LoadingRows() {
  return SKELETON_ROWS.map((rowKey) => (
    <TableRow key={rowKey}>
      {SKELETON_CELLS.map((cellKey, cellIndex) => (
        <TableCell key={`${rowKey}-${cellKey}`}>
          <Skeleton className={cn("h-5", cellIndex === 1 ? "w-32" : "w-20")} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

export function QueueBoard() {
  const { canAccess, scope } = useProviderSession();
  const [selectedDate, setSelectedDate] = useState(localDateKey);
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailsBooking, setDetailsBooking] = useState<ProviderBooking | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const detailsController = useRef<AbortController | null>(null);
  const canViewQueue = canAccess("queue");
  const canManageBookings = canAccess("bookings");

  const fetchQueue = useCallback(
    async (signal: AbortSignal) => {
      void refreshKey;
      setIsLoading(true);
      setError("");
      try {
        setBookings(await loadProviderQueue(selectedDate, signal));
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "The booking queue could not be loaded.");
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [refreshKey, selectedDate],
  );

  useEffect(() => {
    if (!canViewQueue) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    void fetchQueue(controller.signal);
    return () => controller.abort();
  }, [canViewQueue, fetchQueue]);

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesStatus = status === "all" || normalize(booking.status) === status;
      const matchesSearch =
        !term ||
        [
          booking.booking_code,
          booking.customer_name,
          booking.customer_phone,
          booking.customer_id,
          booking.staff_id,
          booking.queue_number,
        ].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(term),
        );
      return matchesStatus && matchesSearch;
    });
  }, [bookings, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstRow = filteredBookings.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, filteredBookings.length);
  const PendingIcon = pendingAction?.action.icon ?? ListOrdered;

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

  async function confirmTransition() {
    if (!pendingAction) return;
    setIsMutating(true);
    try {
      const updated = await transitionProviderBooking(pendingAction.booking.id, pendingAction.action.transition);
      setBookings((current) => current.map((booking) => (booking.id === updated.id ? updated : booking)));
      setDetailsBooking((current) => (current?.id === updated.id ? updated : current));
      toast.add({
        description: `${updated.booking_code} is now ${bookingStatusLabel(updated.status)}.`,
        title: "Booking status updated",
        type: "success",
      });
      setPendingAction(null);
    } catch (updateError) {
      toast.add({
        description: updateError instanceof Error ? updateError.message : "The booking status could not be updated.",
        title: "Status update failed",
        type: "error",
      });
    } finally {
      setIsMutating(false);
    }
  }

  if (!canViewQueue) {
    return (
      <Alert variant="destructive">
        <ListOrdered />
        <AlertTitle>Queue access is unavailable</AlertTitle>
        <AlertDescription>Your provider account cannot manage the booking queue.</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="min-w-0 space-y-6">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">Service queue</h2>
          <p className="text-muted-foreground">
            Review daily bookings and update their service status for {scope.label}.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <ListOrdered />
            <AlertTitle>The queue could not be loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
            <Button onClick={() => setRefreshKey((value) => value + 1)} size="sm" variant="outline">
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
          </Alert>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
          <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
            <InputGroup className="w-full xl:max-w-sm">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Filter booking queue"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Filter bookings..."
                value={search}
              />
            </InputGroup>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <QueueDatePicker
                onChange={(value) => {
                  setSelectedDate(value);
                  setPage(1);
                }}
                value={selectedDate}
              />
              <Select
                onValueChange={(value) => {
                  if (!value) return;
                  setStatus(value);
                  setPage(1);
                }}
                value={status}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(search || status !== "all") && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setPage(1);
                  }}
                  variant="ghost"
                >
                  Reset
                </Button>
              )}
              <Button
                aria-label="Refresh booking queue"
                className="w-full gap-1.5 sm:w-8"
                disabled={isLoading}
                onClick={() => setRefreshKey((value) => value + 1)}
                size="icon"
                variant="outline"
              >
                <RefreshCw className={cn(isLoading && "animate-spin")} />
                <span className="sm:sr-only">Refresh</span>
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <LoadingRows /> : null}
                {!isLoading && !pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Empty className="min-h-72 border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <ListOrdered />
                          </EmptyMedia>
                          <EmptyTitle>No booking records found</EmptyTitle>
                          <EmptyDescription>Choose another date or clear the current filters.</EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <Button onClick={() => setSelectedDate(localDateKey())} variant="outline">
                            Show today
                          </Button>
                        </EmptyContent>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : null}
                {!isLoading
                  ? pageRows.map((booking) => {
                      const actions = availableActions(booking, canManageBookings, canViewQueue);
                      return (
                        <TableRow key={booking.id}>
                          <TableCell>
                            {booking.queue_number ? (
                              <Badge variant="secondary">#{booking.queue_number}</Badge>
                            ) : (
                              <span className="text-muted-foreground">Scheduled</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              className="text-left font-medium hover:underline"
                              onClick={() => openDetails(booking)}
                              type="button"
                            >
                              {booking.booking_code}
                            </button>
                            <p className="text-muted-foreground text-xs">
                              {bookingStatusLabel(booking.booking_type || "scheduled")}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{booking.customer_name || "Customer"}</p>
                            <p className="text-muted-foreground text-xs">
                              {booking.customer_phone || `Customer #${booking.customer_id}`}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p>{formatBookingDate(booking.booking_date)}</p>
                            <p className="text-muted-foreground text-xs">
                              {formatBookingTime(booking.starts_at)}
                              {booking.ends_at ? ` – ${formatBookingTime(booking.ends_at)}` : ""}
                            </p>
                          </TableCell>
                          <TableCell>{booking.staff_id ? `Staff #${booking.staff_id}` : "Unassigned"}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(booking.status)}>{bookingStatusLabel(booking.status)}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <QueueActions
                              actions={actions}
                              booking={booking}
                              onStatusAction={(selected, action) => setPendingAction({ action, booking: selected })}
                              onView={openDetails}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Showing {firstRow}–{lastRow} of {filteredBookings.length} bookings
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                onValueChange={(value) => {
                  if (!value) return;
                  setPageSize(Number(value));
                  setPage(1);
                }}
                value={String(pageSize)}
              >
                <SelectTrigger className="w-24" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} rows
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={currentPage === 1}
                      className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((value) => Math.max(1, value - 1));
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#" isActive onClick={(event) => event.preventDefault()}>
                      {currentPage} / {pageCount}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={currentPage === pageCount}
                      className={cn(currentPage === pageCount && "pointer-events-none opacity-50")}
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((value) => Math.min(pageCount, value + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </div>
      </div>

      <BookingDetailsSheet
        booking={detailsBooking}
        error={detailsError}
        isLoading={detailsLoading}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            detailsController.current?.abort();
            setDetailsBooking(null);
            setDetailsError("");
            setDetailsLoading(false);
          }
        }}
        open={detailsOpen}
      />

      <AlertDialog
        onOpenChange={(open) => !open && !isMutating && setPendingAction(null)}
        open={Boolean(pendingAction)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <PendingIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>{pendingAction?.action.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.action.description} This updates booking {pendingAction?.booking.booking_code} through the
              Go booking service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Keep current status</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              onClick={(event) => {
                event.preventDefault();
                void confirmTransition();
              }}
              variant={pendingAction?.action.destructive ? "destructive" : "default"}
            >
              {isMutating ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
              Confirm update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
