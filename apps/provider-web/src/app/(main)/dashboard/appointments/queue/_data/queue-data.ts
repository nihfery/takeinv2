import type { ProviderBooking } from "../../booking/_data/booking-data";

export type QueueTransition = "call" | "check-in" | "start" | "complete" | "cancel" | "no-show";

interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

async function responseMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return payload?.message ?? payload?.error ?? fallback;
}

export async function loadProviderQueue(date: string, signal: AbortSignal) {
  const query = new URLSearchParams({ date });
  const response = await fetch(`/api/provider/bookings/queue?${query.toString()}`, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });

  if (!response.ok) throw new Error(await responseMessage(response, "The booking queue could not be loaded."));
  const payload = (await response.json()) as ApiEnvelope<ProviderBooking[]>;
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function transitionProviderBooking(bookingId: number, transition: QueueTransition) {
  const response = await fetch(`/api/provider/bookings/${bookingId}/${transition}`, {
    body: "{}",
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) throw new Error(await responseMessage(response, "The booking status could not be updated."));
  const payload = (await response.json()) as ApiEnvelope<ProviderBooking>;
  if (!payload.data) throw new Error("The booking service returned an empty response.");
  return payload.data;
}
