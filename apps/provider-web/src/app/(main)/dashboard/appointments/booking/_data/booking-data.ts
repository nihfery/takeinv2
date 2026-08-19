export interface ProviderBooking {
  actual_ended_at: string | null;
  actual_started_at: string | null;
  booking_code: string;
  booking_date: string;
  booking_type: string;
  branch_id: number | null;
  checked_in_at: string | null;
  completed_at: string | null;
  created_at: string;
  currency: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  dp_amount_minor: number;
  ends_at: string | null;
  expired_at: string | null;
  held_at: string | null;
  hold_expires_at: string | null;
  id: number;
  idempotency_key: string | null;
  notes: string | null;
  participant_count: number;
  payment_amount_minor: number;
  payment_channel?: string;
  payment_type: string;
  provider_id: number;
  queue_number: number | null;
  staff_id: number | null;
  starts_at: string | null;
  status: string;
  total_duration: number;
  total_price_minor: number;
  updated_at: string;
}

interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface BookingFilters {
  date?: string;
  status?: string;
}

export interface ProviderBookingUpdate {
  customer_name: string;
  customer_phone: string;
  notes: string;
}

export class BookingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BookingApiError";
  }
}

export async function loadProviderBookings(filters: BookingFilters, signal: AbortSignal) {
  const query = new URLSearchParams();
  if (filters.date) query.set("date", filters.date);
  if (filters.status && filters.status !== "all") query.set("status", filters.status);

  const response = await fetch(`/api/provider/bookings${query.size ? `?${query.toString()}` : ""}`, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ProviderBooking[]> | null;

  if (!response.ok) {
    throw new BookingApiError(payload?.message ?? "Booking data could not be loaded.", response.status);
  }

  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function loadProviderBooking(bookingId: number, signal: AbortSignal) {
  const response = await fetch(`/api/provider/bookings/${bookingId}`, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ProviderBooking> | null;
  if (!response.ok || !payload?.data) {
    throw new BookingApiError(payload?.message ?? "Booking details could not be loaded.", response.status);
  }
  return payload.data;
}

export async function updateProviderBooking(bookingId: number, update: ProviderBookingUpdate) {
  const response = await fetch(`/api/provider/bookings/${bookingId}`, {
    body: JSON.stringify(update),
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "PATCH",
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<ProviderBooking> | null;
  if (!response.ok || !payload?.data) {
    throw new BookingApiError(payload?.message ?? "Booking details could not be saved.", response.status);
  }
  return payload.data;
}

export function bookingStatusLabel(status: string | null | undefined) {
  const normalizedStatus = status?.trim();
  if (!normalizedStatus) return "Not assigned";

  return normalizedStatus
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatBookingMoney(minorUnits: number, currency = "IDR") {
  return new Intl.NumberFormat("en-ID", {
    currency: currency || "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format((Number(minorUnits) || 0) / 100);
}

export function formatBookingDate(value: string | null | undefined) {
  if (!value) return "Date not assigned";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(date);
}

export function formatBookingTime(value: string | null) {
  if (!value) return "Time not assigned";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not assigned";
  return new Intl.DateTimeFormat("en-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}
