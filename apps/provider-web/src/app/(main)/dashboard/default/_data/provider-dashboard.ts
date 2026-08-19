export interface ProviderMetricSummary {
  activeBranches: number;
  activeServices: number;
  activeStaff: number;
  paidPayments: number;
  revenueMinor: number;
  returningCustomers: number;
  todayBookings: number;
  totalBookings: number;
  totalCustomers: number;
  totalServices: number;
  upcomingBookings: number;
}

export interface BookingChartPoint {
  completedBookings: number;
  date: string;
  scheduledBookings: number;
  walkInBookings: number;
}

export interface ProviderCustomerRow {
  bookingCount: number;
  code: string;
  currency: string;
  email: string;
  id: string;
  lastBooking: string | null;
  name: string;
  status: string;
  totalSpentMinor: number;
}

export interface ProviderDashboardSnapshot {
  chart: BookingChartPoint[];
  customerTotalBookings: number;
  customers: ProviderCustomerRow[];
  metrics: ProviderMetricSummary;
  providerName: string;
  warnings: string[];
}

interface ApiEnvelope<T> {
  data: T;
}

interface ProviderUser {
  name?: string;
  role?: string;
}

interface ProviderBooking {
  booking_date?: string;
  booking_type?: string;
  status?: string;
}

interface ProviderPayment {
  amount_minor?: number;
  booking_id?: number;
  status?: string;
}

interface ProviderCustomer {
  customer_code?: string;
  display_name?: string;
  email?: string;
  id?: number;
  provider_bookings_count?: number;
  provider_last_booking_date?: string | null;
  provider_total_spent_minor_units?: number;
  status?: string;
}

interface ProviderCustomerSummary {
  returning_customers?: number;
  total_bookings?: number;
  total_customers?: number;
}

interface ProviderCustomersPayload {
  customers?: ProviderCustomer[];
  summary?: ProviderCustomerSummary;
}

interface ProviderService {
  status?: string;
}

interface ProviderBranch {
  status?: string;
}

interface ProviderStaff {
  status?: string;
}

interface OptionalResult<T> {
  data: T;
  warning?: string;
}

export class ProviderApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}

async function apiRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    const message = payload?.message?.trim() ? payload.message : "The provider data could not be loaded.";
    throw new ProviderApiError(message, response.status);
  }

  if (!payload) throw new ProviderApiError("The provider API returned an empty response.", response.status);
  return payload;
}

async function optionalRequest<T>(
  path: string,
  fallback: T,
  label: string,
  signal: AbortSignal,
): Promise<OptionalResult<T>> {
  try {
    const payload = await apiRequest<ApiEnvelope<T>>(path, signal);
    return { data: payload.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { data: fallback, warning: `${label} is temporarily unavailable.` };
  }
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: Number(value.day), month: Number(value.month), year: Number(value.year) };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function bookingChart(bookings: ProviderBooking[]): BookingChartPoint[] {
  const { month, year } = dateParts();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const points = new Map<string, BookingChartPoint>();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dateKey(year, month, day);
    points.set(date, {
      completedBookings: 0,
      date,
      scheduledBookings: 0,
      walkInBookings: 0,
    });
  }

  for (const booking of bookings) {
    if (!booking.booking_date || !points.has(booking.booking_date)) continue;
    const point = points.get(booking.booking_date);
    if (!point) continue;

    if (["walk_in", "queue", "manual"].includes(booking.booking_type || "")) point.walkInBookings += 1;
    else point.scheduledBookings += 1;

    if (["completed", "order_completed"].includes(booking.status || "")) point.completedBookings += 1;
  }

  return Array.from(points.values());
}

function customerRows(customers: ProviderCustomer[]): ProviderCustomerRow[] {
  return customers.map((customer) => ({
    bookingCount: numberValue(customer.provider_bookings_count),
    code: customer.customer_code || `CUS-${customer.id || 0}`,
    currency: "IDR",
    email: customer.email || "—",
    id: String(customer.id || customer.customer_code || "unknown"),
    lastBooking: customer.provider_last_booking_date || null,
    name: customer.display_name || "Unnamed customer",
    status: customer.status || "unknown",
    totalSpentMinor: numberValue(customer.provider_total_spent_minor_units),
  }));
}

export async function loadProviderDashboard(signal: AbortSignal): Promise<ProviderDashboardSnapshot> {
  const session = await apiRequest<{ user: ProviderUser }>("/api/auth/provider/me", signal);
  if (session.user?.role !== "provider") {
    throw new ProviderApiError("This dashboard requires an active provider account.", 403);
  }

  const [bookingResult, paymentResult, customerResult, serviceResult, branchResult, staffResult] = await Promise.all([
    optionalRequest<ProviderBooking[]>("/api/provider/bookings", [], "Booking data", signal),
    optionalRequest<ProviderPayment[]>("/api/provider/payments", [], "Payment data", signal),
    optionalRequest<ProviderCustomersPayload>(
      "/api/provider/customers",
      { customers: [], summary: {} },
      "Customer data",
      signal,
    ),
    optionalRequest<ProviderService[]>("/api/provider/services", [], "Service data", signal),
    optionalRequest<ProviderBranch[]>("/api/provider/branches", [], "Branch data", signal),
    optionalRequest<ProviderStaff[]>("/api/provider/staff", [], "Staff data", signal),
  ]);

  const bookings = Array.isArray(bookingResult.data) ? bookingResult.data : [];
  const payments = Array.isArray(paymentResult.data) ? paymentResult.data : [];
  const customers = Array.isArray(customerResult.data.customers) ? customerResult.data.customers : [];
  const services = Array.isArray(serviceResult.data) ? serviceResult.data : [];
  const branches = Array.isArray(branchResult.data) ? branchResult.data : [];
  const staff = Array.isArray(staffResult.data) ? staffResult.data : [];
  const summary = customerResult.data.summary || {};
  const { day, month, year } = dateParts();
  const today = dateKey(year, month, day);
  const upcomingStatuses = new Set(["confirmed", "waiting", "checked_in", "in_progress", "inprogress"]);
  const paidPayments = payments.filter((payment) => payment.status === "paid" && numberValue(payment.booking_id) > 0);
  const warnings = [
    bookingResult.warning,
    paymentResult.warning,
    customerResult.warning,
    serviceResult.warning,
    branchResult.warning,
    staffResult.warning,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    chart: bookingChart(bookings),
    customerTotalBookings: numberValue(summary.total_bookings),
    customers: customerRows(customers),
    metrics: {
      activeBranches: branches.filter((branch) => branch.status === "active").length,
      activeServices: services.filter((service) => service.status === "active").length,
      activeStaff: staff.filter((member) => member.status === "active").length,
      paidPayments: paidPayments.length,
      revenueMinor: paidPayments.reduce((total, payment) => total + numberValue(payment.amount_minor), 0),
      returningCustomers: numberValue(summary.returning_customers),
      todayBookings: bookings.filter((booking) => booking.booking_date === today).length,
      totalBookings: bookings.length,
      totalCustomers: numberValue(summary.total_customers) || customers.length,
      totalServices: services.length,
      upcomingBookings: bookings.filter((booking) =>
        Boolean(booking.booking_date && booking.booking_date >= today && upcomingStatuses.has(booking.status || "")),
      ).length,
    },
    providerName: session.user.name || "Provider workspace",
    warnings,
  };
}
