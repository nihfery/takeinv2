async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function validationMessage(payload, fallback) {
  const first = Object.values(payload?.errors || {}).flat().find(Boolean);
  return first || payload?.message || fallback;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path.startsWith('/api/') ? path : `/api/${String(path).replace(/^\/+/, '')}`, {
    ...options,
    credentials: 'include',
    cache: options.cache || 'no-store',
    headers,
    body: options.body instanceof FormData || typeof options.body === 'string'
      ? options.body
      : (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const payload = response.status === 204 ? {} : await parseJson(response);
  if (!response.ok) {
    const error = new Error(validationMessage(payload, 'The request could not be processed.'));
    error.status = response.status;
    error.errors = payload?.errors || {};
    throw error;
  }
  return payload;
}

export function loginAdmin(email, password) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { email, password, role: 'admin' } });
}

export function currentAdmin() {
  return apiRequest('/api/auth/me');
}

export function logoutAdmin() {
  return apiRequest('/api/auth/logout', { method: 'POST', body: {} });
}

export function dataOf(payload, fallback = null) {
  return payload?.data ?? fallback;
}

export function listOf(payload) {
  const value = dataOf(payload, payload);
  if (Array.isArray(value)) return value;
  for (const key of ['items', 'data', 'providers', 'customers', 'services', 'categories', 'bookings', 'coupons', 'records']) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}
