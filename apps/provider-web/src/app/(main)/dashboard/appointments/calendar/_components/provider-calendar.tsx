"use client";

import * as React from "react";

import { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import multiMonthPlugin from "@fullcalendar/react/multimonth";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";
import { AlertCircle, CalendarIcon, ChevronLeft, ChevronRight, RefreshCw, ShieldAlert, XIcon } from "lucide-react";

import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { useProviderSession } from "@/components/provider-session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";

import { BookingDetailsSheet } from "../../booking/_components/booking-details-sheet";
import type { ProviderBooking } from "../../booking/_data/booking-data";
import { loadProviderCalendar, type ProviderCalendarRange } from "../_data/calendar-data";

const views = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
  { value: "listWeek", label: "Agenda" },
];

const bookingTypes = [
  { value: "all", label: "All appointments" },
  { value: "scheduled", label: "Scheduled" },
  { value: "walk_in", label: "Walk-in" },
  { value: "queue", label: "Queue" },
  { value: "group", label: "Group" },
  { value: "manual", label: "Manual" },
];

const plugins = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, multiMonthPlugin];
const businessTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Jakarta",
});

function bookingColor(status: string) {
  const normalizedStatus = status.toLowerCase();
  if (["cancelled", "canceled", "expired", "no_show"].includes(normalizedStatus)) return "var(--destructive)";
  if (["completed", "paid", "served"].includes(normalizedStatus)) return "var(--chart-2)";
  if (["pending", "held", "waiting_payment"].includes(normalizedStatus)) return "var(--chart-4)";
  return "var(--primary)";
}

function bookingTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = Object.fromEntries(businessTimeFormatter.formatToParts(parsed).map((part) => [part.type, part.value]));
  if (!parts.hour || !parts.minute || !parts.second) return null;
  return `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}`;
}

function bookingEventSchedule(booking: ProviderBooking) {
  if (!booking.starts_at) {
    return {
      allDay: true,
      end: undefined,
      start: booking.booking_date,
    };
  }

  const startTime = bookingTime(booking.starts_at);
  if (!startTime) {
    return {
      allDay: true,
      end: undefined,
      start: booking.booking_date,
    };
  }

  const start = `${booking.booking_date}T${startTime}+07:00`;
  const storedStart = new Date(booking.starts_at).getTime();
  const storedEnd = booking.ends_at ? new Date(booking.ends_at).getTime() : Number.NaN;
  const storedDuration = storedEnd > storedStart ? storedEnd - storedStart : 0;
  const duration = booking.total_duration > 0 ? booking.total_duration * 60_000 : storedDuration;

  return {
    allDay: false,
    end: duration > 0 ? new Date(new Date(start).getTime() + duration).toISOString() : undefined,
    start,
  };
}

function previousISODate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function CalendarDatePicker({ value, onChange }: Readonly<{ value: Date; onChange: (date: Date) => void }>) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-between font-normal sm:w-auto"
            id="calendar-date"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="text-muted-foreground">Date:</span>
        {format(value, "MMM d, yyyy")}
        <CalendarIcon data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={value}
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onChange(date);
            setOpen(false);
          }}
          selected={value}
          timeZone="Asia/Jakarta"
        />
      </PopoverContent>
    </Popover>
  );
}

export function ProviderCalendar() {
  const controller = useCalendarController();
  const isMobile = useIsMobile();
  const hasAppliedMobileView = React.useRef(false);
  const { canAccess, scope } = useProviderSession();
  const hasCalendarAccess = canAccess("calendar");
  const [bookingType, setBookingType] = React.useState("all");
  const [bookings, setBookings] = React.useState<ProviderBooking[]>([]);
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedBooking, setSelectedBooking] = React.useState<ProviderBooking | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [range, setRange] = React.useState<ProviderCalendarRange | null>(null);
  const [dateInfo, setDateInfo] = React.useState(() => {
    const now = new Date();
    return {
      days: differenceInCalendarDays(endOfMonth(now), startOfMonth(now)) + 1,
      title: format(now, "MMMM yyyy"),
    };
  });

  React.useEffect(() => {
    if (!isMobile || hasAppliedMobileView.current || !controller.view) return;
    hasAppliedMobileView.current = true;
    if (["dayGridMonth", "timeGridWeek"].includes(controller.view.type)) {
      controller.changeView("listWeek");
    }
  }, [controller, isMobile]);

  React.useEffect(() => {
    if (!hasCalendarAccess || !range) return;

    const abortController = new AbortController();
    setIsLoading(true);
    setError("");

    void loadProviderCalendar({ ...range, bookingType }, abortController.signal)
      .then(setBookings)
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setBookings([]);
        setError(loadError instanceof Error ? loadError.message : "Appointment calendar could not be loaded.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) setIsLoading(false);
      });

    return () => abortController.abort();
  }, [bookingType, hasCalendarAccess, range]);

  const refreshCalendar = React.useCallback(() => {
    setRange((currentRange) => (currentRange ? { ...currentRange } : currentRange));
  }, []);

  const events = React.useMemo(
    () =>
      bookings.map((booking) => {
        const schedule = bookingEventSchedule(booking);
        return {
          ...schedule,
          backgroundColor: bookingColor(booking.status),
          borderColor: bookingColor(booking.status),
          extendedProps: { booking },
          id: String(booking.id),
          title: `${booking.customer_name ?? "Walk-in customer"} · ${booking.booking_code}`,
        };
      }),
    [bookings],
  );

  if (!hasCalendarAccess) {
    return (
      <Alert>
        <ShieldAlert />
        <AlertTitle>Calendar access is not assigned</AlertTitle>
        <AlertDescription>
          This branch account does not have the calendar permission. Ask the head office administrator to update the
          account permissions.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col overflow-hidden rounded-md border">
        <div className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            <div className="font-medium text-lg leading-none">{dateInfo.title}</div>
            <p className="text-muted-foreground text-sm">
              {dateInfo.days} days · {bookings.length} appointments · {scope.label}
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <CalendarDatePicker
              onChange={(date) => {
                setSelectedDate(date);
                controller.gotoDate(format(date, "yyyy-MM-dd"));
                controller.changeView("timeGridDay");
              }}
              value={selectedDate}
            />

            <Select
              value={bookingType}
              onValueChange={(value) => {
                if (value !== null) setBookingType(value);
              }}
              items={bookingTypes}
            >
              <SelectTrigger className="w-full sm:w-44">
                <span className="text-muted-foreground">Type:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {bookingTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <ButtonGroup className="w-full sm:w-fit">
              <Button aria-label="Previous period" size="icon" variant="outline" onClick={() => controller.prev()}>
                <ChevronLeft />
              </Button>
              <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => controller.today()}>
                Today
              </Button>
              <Button aria-label="Next period" size="icon" variant="outline" onClick={() => controller.next()}>
                <ChevronRight />
              </Button>
            </ButtonGroup>

            <Select
              value={controller.view?.type ?? views[0].value}
              onValueChange={(value) => {
                if (value !== null) controller.changeView(value);
              }}
              items={views}
            >
              <SelectTrigger className="w-full sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {views.map((view) => (
                    <SelectItem key={view.value} value={view.value}>
                      {view.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Button
              aria-label="Refresh appointments"
              className="w-full gap-1.5 sm:w-8"
              disabled={isLoading}
              size="icon"
              variant="outline"
              onClick={refreshCalendar}
            >
              {isLoading ? <Spinner /> : <RefreshCw />}
              <span className="sm:sr-only">Refresh</span>
            </Button>
          </div>
        </div>

        {error ? (
          <div className="border-b p-3">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Calendar data unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <EventCalendarViews
          controller={controller}
          initialView={views[0].value}
          plugins={[...plugins]}
          popoverCloseContent={() => <XIcon className="size-5 text-muted-foreground group-hover:text-foreground" />}
          events={events}
          eventClick={(info) => {
            const booking = info.event.extendedProps.booking as ProviderBooking | undefined;
            if (!booking) return;
            setSelectedBooking(booking);
            setDetailsOpen(true);
          }}
          nowIndicator
          timeZone="Asia/Jakarta"
          datesSet={(info) => {
            setSelectedDate(controller.getDate() ?? info.view.currentStart);
            const nextRange = {
              bookingType,
              from: info.startStr.slice(0, 10),
              to: previousISODate(info.endStr),
            };
            setDateInfo({
              days: differenceInCalendarDays(info.view.currentEnd, info.view.currentStart),
              title: info.view.title,
            });
            setRange((currentRange) =>
              currentRange?.from === nextRange.from && currentRange.to === nextRange.to ? currentRange : nextRange,
            );
          }}
        />
      </div>

      <BookingDetailsSheet
        booking={selectedBooking}
        error=""
        isLoading={false}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}
