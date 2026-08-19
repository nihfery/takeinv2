const defaultHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

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
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
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

export function currentProvider() {
  return apiRequest('/api/auth/provider/me');
}

export function loginProvider(email, password) {
  return apiRequest('/api/auth/login', { method: 'POST', headers: defaultHeaders, body: { email, password, role: 'provider' } });
}

export async function logoutProvider() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST', headers: defaultHeaders, body: {} });
  } finally {
    if (typeof window !== 'undefined') sessionStorage.removeItem('takein_provider_user');
  }
}

export function dataOf(payload, fallback = null) {
  return payload?.data ?? fallback;
}
