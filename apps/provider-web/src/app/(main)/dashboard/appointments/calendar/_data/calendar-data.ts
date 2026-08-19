import type { ProviderBooking } from "../../booking/_data/booking-data";

interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface ProviderCalendarRange {
  bookingType: string;
  from: string;
  to: string;
}

export async function loadProviderCalendar(range: ProviderCalendarRange, signal: AbortSignal) {
  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
  });
  if (range.bookingType !== "all") query.set("booking_type", range.bookingType);

  const response = await fetch(`/api/provider/bookings/calendar?${query.toString()}`, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ProviderBooking[]> | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Appointment calendar could not be loaded.");
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}
