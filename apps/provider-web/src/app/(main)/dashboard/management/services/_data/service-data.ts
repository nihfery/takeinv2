export interface ProviderService {
  additional_services: unknown[];
  branch_ids: number[];
  category_id: number | null;
  category_text: string;
  code: string | null;
  created_at: string;
  description: string | null;
  dp_amount: number;
  estimated_duration: number;
  gallery_object_ids: string[];
  holidays: unknown[];
  id: number;
  includes: string | null;
  is_queue_enabled: boolean;
  is_scheduled_enabled: boolean;
  maximum_duration: number;
  minimum_duration: number;
  payment_policy: string | null;
  price: number;
  price_type: string | null;
  provider_id: number;
  requires_dp: boolean;
  slots: unknown[];
  slug: string;
  status: "active" | "inactive";
  title: string;
  updated_at: string;
  verify_status: string;
  video_url: string | null;
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
  slug: string;
  status: "active";
}

export interface ProviderServiceInput {
  additional_services: unknown[];
  branch_ids: number[];
  category: string;
  category_id: number | null;
  code: string;
  description: string;
  dp_amount: number;
  estimated_duration: number;
  gallery_object_ids: string[];
  holidays: unknown[];
  includes: string;
  is_queue_enabled: boolean;
  is_scheduled_enabled: boolean;
  maximum_duration: number;
  minimum_duration: number;
  payment_policy: string;
  price: number;
  price_type: string;
  requires_dp: boolean;
  slots: unknown[];
  slug: string;
  status: "active" | "inactive";
  title: string;
  video_url: string;
}

interface ApiEnvelope<T> {
  data: T;
  errors?: Record<string, string[]>;
  message?: string;
}

export class ServiceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServiceApiError";
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
    throw new ServiceApiError(apiMessage(payload, fallback), response.status);
  }
  return payload.data;
}

export function loadProviderServices(signal: AbortSignal) {
  return request<ProviderService[]>(
    "/api/provider/services",
    { method: "GET", signal },
    "Services could not be loaded.",
  );
}

export function loadProviderService(serviceId: number, signal: AbortSignal) {
  return request<ProviderService>(
    `/api/provider/services/${serviceId}`,
    { method: "GET", signal },
    "Service details could not be loaded.",
  );
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
    "Service categories could not be loaded.",
  );
}

export function createProviderService(input: ProviderServiceInput) {
  return request<ProviderService>(
    "/api/provider/services",
    { body: JSON.stringify(input), method: "POST" },
    "Service could not be created.",
  );
}

export function updateProviderService(serviceId: number, input: ProviderServiceInput) {
  return request<ProviderService>(
    `/api/provider/services/${serviceId}`,
    { body: JSON.stringify(input), method: "PUT" },
    "Service could not be updated.",
  );
}

export function toggleProviderService(serviceId: number) {
  return request<ProviderService>(
    `/api/provider/services/${serviceId}/toggle-status`,
    { body: "{}", method: "PATCH" },
    "Service status could not be changed.",
  );
}

export function formatServiceMoney(value: number) {
  return new Intl.NumberFormat("en-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Number(value) || 0);
}

export function serviceLabel(value: string | null | undefined) {
  if (!value) return "Not assigned";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
