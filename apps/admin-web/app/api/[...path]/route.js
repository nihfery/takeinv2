import { NextResponse } from 'next/server';

const ACCESS_COOKIE = 'takein_admin_access_token';
const REFRESH_COOKIE = 'takein_admin_refresh_token';
const LEGACY_ACCESS_COOKIE = 'takein_access_token';
const LEGACY_REFRESH_COOKIE = 'takein_refresh_token';
const PORTAL_ROLE = 'admin';
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

function origin(name, fallback) {
  return String(process.env[name] || fallback).replace(/\/$/, '');
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.TAKEIN_COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

function proxyHeaders(request, accessToken) {
  const headers = new Headers();
  for (const name of ['accept', 'content-type', 'idempotency-key', 'x-correlation-id', 'x-request-id']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('x-forwarded-host', request.headers.get('host') || '');
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));
  return headers;
}

async function callBackend(request, path, accessToken, body) {
  const target = new URL(`${origin('GO_API_BASE_URL', 'http://127.0.0.1:8088')}/api/${path.join('/')}`);
  target.search = request.nextUrl.search;
  return fetch(target, {
    method: request.method,
    headers: proxyHeaders(request, accessToken),
    body,
    cache: 'no-store',
    redirect: 'manual',
  });
}

async function refresh(refreshToken) {
  if (!refreshToken) return null;
  const response = await fetch(`${origin('GO_IDENTITY_URL', 'http://127.0.0.1:18081')}/internal/v1/auth/refresh`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, role: PORTAL_ROLE }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.access_token && payload?.refresh_token && payload?.user?.role === PORTAL_ROLE ? payload : null;
}

function cleanAuthPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const clean = { ...payload };
  delete clean.token;
  delete clean.access_token;
  delete clean.refresh_token;
  return clean;
}

async function toResponse(backend, authPayload, session, clearSession) {
  const headers = new Headers({ 'cache-control': 'no-store' });
  for (const name of ['content-type', 'location', 'content-disposition']) {
    const value = backend.headers.get(name);
    if (value) headers.set(name, value);
  }
  const body = authPayload
    ? JSON.stringify(cleanAuthPayload(authPayload))
    : await backend.arrayBuffer().then((value) => value.byteLength ? value : null);
  if (authPayload) headers.set('content-type', 'application/json');
  const response = new NextResponse(body, { status: backend.status, headers });
  if (session?.access_token && session?.refresh_token) {
    response.cookies.set(ACCESS_COOKIE, session.access_token, cookieOptions(Number(session.expires_in) || ACCESS_MAX_AGE));
    response.cookies.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(REFRESH_MAX_AGE));
  }
  if (clearSession) {
    response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
    response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
  }
  response.cookies.set(LEGACY_ACCESS_COOKIE, '', cookieOptions(0));
  response.cookies.set(LEGACY_REFRESH_COOKIE, '', cookieOptions(0));
  return response;
}

function portalAuthBody(route, body) {
  if (route !== 'auth/login' || !body?.byteLength) return body;
  try {
    const payload = JSON.parse(new TextDecoder().decode(body));
    return JSON.stringify({ ...payload, role: PORTAL_ROLE });
  } catch {
    return body;
  }
}

async function proxy(request, context) {
  const { path = [] } = await context.params;
  const route = path.join('/');
  const backendPath = route === 'auth/me' ? ['auth', PORTAL_ROLE, 'me'] : path;
  const isAuth = route === 'auth/login';
  const isLogout = route === 'auth/logout';
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value || '';
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value || '';
  const originalBody = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const body = isLogout
    ? JSON.stringify({ refresh_token: refreshToken })
    : portalAuthBody(route, originalBody);
  let backend = await callBackend(request, backendPath, accessToken, body);
  let session = null;
  if (backend.status === 401 && refreshToken && !isAuth && !isLogout) {
    session = await refresh(refreshToken);
    if (session) {
      accessToken = session.access_token;
      backend = await callBackend(request, backendPath, accessToken, body);
    }
  }
  let authPayload = null;
  if (isAuth && backend.ok) {
    authPayload = await backend.clone().json().catch(() => null);
    if (authPayload?.user?.role === PORTAL_ROLE) {
      session = authPayload;
    } else {
      backend = Response.json({ message: 'This account cannot sign in to the admin portal.' }, { status: 403 });
      authPayload = null;
      session = null;
    }
  }
  return toResponse(backend, authPayload, session, isLogout || (backend.status === 401 && !session));
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
