export interface ProviderStaff {
  address: string | null;
  bio: string | null;
  branch_id: number | null;
  category_id: number | null;
  city_id: string | null;
  country_code: string | null;
  country_id: string | null;
  created_at: string;
  current_status: string;
  date_of_birth: string | null;
  email: string;
  first_name: string;
  gender: string | null;
  id: number;
  image_object_id?: string | null;
  last_name: string;
  phone_number: string | null;
  postal_code: string | null;
  provider_id: number;
  role: string;
  state_id: string | null;
  status: "active" | "inactive";
  updated_at: string;
  username: string | null;
}

export interface ProviderBranch {
  branch_name: string;
  id: number;
  status: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  parent_id: number | null;
  status: string;
}

export interface ProviderServiceOption {
  branch_ids: number[];
  category_id: number | null;
  category_text: string;
  id: number;
  price: number;
  status: "active" | "inactive";
  title: string;
}

export interface StaffSchedule {
  day_of_week: string;
  end_time: string;
  id: number;
  is_available: boolean;
  staff_id: number;
  start_time: string;
}

export interface StaffScheduleInput {
  day_of_week: string;
  end_time: string;
  is_available: boolean;
  start_time: string;
}

export interface StaffInput {
  address: string;
  bio: string;
  branch_id: number;
  category_id: number;
  city_id: string;
  country_code: string;
  country_id: string;
  date_of_birth: string;
  email: string;
  first_name: string;
  gender: string;
  last_name: string;
  phone_number: string;
  postal_code: string;
  role: string;
  state_id: string;
  status: "active" | "inactive";
  username: string;
}

interface ApiEnvelope<T> {
  data: T;
  errors?: Record<string, string[]>;
  message?: string;
}

export class TeamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TeamApiError";
  }
}

function apiMessage(payload: ApiEnvelope<unknown> | null, fallback: string) {
  const validationMessage = payload?.errors ? Object.values(payload.errors).flat().find(Boolean) : undefined;
  return validationMessage ?? payload?.message ?? fallback;
}

async function request<T>(path: string, init: RequestInit, fallback: string) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || payload?.data === undefined) {
    throw new TeamApiError(apiMessage(payload, fallback), response.status);
  }
  return payload.data;
}

async function requestNoContent(path: string, init: RequestInit, fallback: string) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    ...init,
  });
  if (response.ok) return;
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  throw new TeamApiError(apiMessage(payload, fallback), response.status);
}

export function loadProviderStaff(signal: AbortSignal) {
  return request<ProviderStaff[]>("/api/provider/staff", { method: "GET", signal }, "Staff could not be loaded.");
}

export function loadProviderBranches(signal: AbortSignal) {
  return request<ProviderBranch[]>(
    "/api/provider/branches",
    { method: "GET", signal },
    "Branches could not be loaded.",
  );
}

export function loadServiceCategories(signal: AbortSignal) {
  return request<ServiceCategory[]>(
    "/api/categories",
    { method: "GET", signal },
    "Staff categories could not be loaded.",
  );
}

export function loadProviderServices(signal: AbortSignal) {
  return request<ProviderServiceOption[]>(
    "/api/provider/services",
    { method: "GET", signal },
    "Services could not be loaded.",
  );
}

export function createProviderStaff(input: StaffInput) {
  return request<ProviderStaff>(
    "/api/provider/staff",
    { body: JSON.stringify(input), method: "POST" },
    "Staff member could not be created.",
  );
}

export function updateProviderStaff(staffId: number, input: StaffInput) {
  return request<ProviderStaff>(
    `/api/provider/staff/${staffId}`,
    { body: JSON.stringify(input), method: "PUT" },
    "Staff member could not be updated.",
  );
}

export function deleteProviderStaff(staffId: number) {
  return requestNoContent(`/api/provider/staff/${staffId}`, { method: "DELETE" }, "Staff member could not be deleted.");
}

export function loadStaffSkills(staffId: number, signal: AbortSignal) {
  return request<{ service_ids: number[] }>(
    `/api/provider/staff/${staffId}/skills`,
    { method: "GET", signal },
    "Staff skills could not be loaded.",
  );
}

export function replaceStaffSkills(staffId: number, serviceIds: number[]) {
  return request<{ service_ids: number[] }>(
    `/api/provider/staff/${staffId}/skills`,
    { body: JSON.stringify({ service_ids: serviceIds }), method: "PUT" },
    "Staff skills could not be saved.",
  );
}

export function loadStaffSchedules(staffId: number, signal: AbortSignal) {
  return request<StaffSchedule[]>(
    `/api/provider/staff/${staffId}/schedules`,
    { method: "GET", signal },
    "Work schedule could not be loaded.",
  );
}

export function replaceStaffSchedules(staffId: number, schedules: StaffScheduleInput[]) {
  return request<StaffSchedule[]>(
    `/api/provider/staff/${staffId}/schedules`,
    { body: JSON.stringify({ schedules }), method: "PUT" },
    "Work schedule could not be saved.",
  );
}

export function staffName(staff: ProviderStaff) {
  return `${staff.first_name} ${staff.last_name}`.trim();
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
