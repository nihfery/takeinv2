import { NextResponse } from 'next/server';

const ACCESS_COOKIE = 'takein_access_token';
const REFRESH_COOKIE = 'takein_refresh_token';
const DEFAULT_ACCESS_MAX_AGE = 15 * 60;
const DEFAULT_REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

function apiOrigin() {
    return String(process.env.GO_API_BASE_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');
}

function identityOrigin() {
    return String(process.env.GO_IDENTITY_URL || process.env.GO_API_BASE_URL || 'http://127.0.0.1:18081').replace(/\/$/, '');
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

function forwardedHeaders(request, accessToken) {
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

async function requestBody(request, overrideBody) {
    if (overrideBody !== undefined) return overrideBody;
    if (request.method === 'GET' || request.method === 'HEAD') return undefined;
    const body = await request.arrayBuffer();
    return body.byteLength ? body : undefined;
}

async function callBackend(request, path, accessToken, body) {
    const target = new URL(`${apiOrigin()}/api/${path.join('/')}`);
    target.search = request.nextUrl.search;
    return fetch(target, {
        method: request.method,
        headers: forwardedHeaders(request, accessToken),
        body,
        cache: 'no-store',
        redirect: 'manual',
    });
}

async function refreshSession(refreshToken) {
    if (!refreshToken) return null;
    const response = await fetch(`${identityOrigin()}/internal/v1/auth/refresh`, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload?.access_token || !payload?.refresh_token) return null;
    return payload;
}

function sanitizedAuthPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const clean = { ...payload };
    delete clean.token;
    delete clean.access_token;
    delete clean.refresh_token;
    return clean;
}

async function responseFromBackend(backendResponse, authResponsePayload, sessionPayload, clearSession = false) {
    const headers = new Headers();
    const contentType = backendResponse.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', 'no-store');
    const location = backendResponse.headers.get('location');
    if (location) headers.set('location', location);
    const disposition = backendResponse.headers.get('content-disposition');
    if (disposition) headers.set('content-disposition', disposition);

    let body;
    if (authResponsePayload) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(sanitizedAuthPayload(authResponsePayload));
    } else {
        const bytes = await backendResponse.arrayBuffer();
        body = bytes.byteLength ? bytes : null;
    }

    const response = new NextResponse(body, {
        status: backendResponse.status,
        headers,
    });

    if (sessionPayload?.access_token && sessionPayload?.refresh_token) {
        response.cookies.set(ACCESS_COOKIE, sessionPayload.access_token, cookieOptions(Number(sessionPayload.expires_in) || DEFAULT_ACCESS_MAX_AGE));
        response.cookies.set(REFRESH_COOKIE, sessionPayload.refresh_token, cookieOptions(DEFAULT_REFRESH_MAX_AGE));
    }
    if (clearSession) {
        response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
        response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
    }
    return response;
}

async function proxy(request, context) {
    const { path = [] } = await context.params;
    const cookieHeader = request.cookies;
    let accessToken = cookieHeader.get(ACCESS_COOKIE)?.value || '';
    let refreshToken = cookieHeader.get(REFRESH_COOKIE)?.value || '';
    const route = path.join('/');
    const isAuthExchange = ['auth/login', 'auth/register/customer', 'auth/register/provider'].includes(route);
    const isLogout = route === 'auth/logout';

    let overrideBody;
    if (isLogout) {
        overrideBody = JSON.stringify({ refresh_token: refreshToken });
    }

    const body = await requestBody(request, overrideBody);
    let backendResponse = await callBackend(request, path, accessToken, body);
    let refreshed = null;

    if (backendResponse.status === 401 && refreshToken && !isAuthExchange && !isLogout) {
        refreshed = await refreshSession(refreshToken);
        if (refreshed) {
            accessToken = refreshed.access_token;
            refreshToken = refreshed.refresh_token;
            backendResponse = await callBackend(request, path, accessToken, body);
        }
    }

    let authResponsePayload = null;
    let sessionPayload = refreshed;
    if (isAuthExchange && backendResponse.ok) {
        authResponsePayload = await backendResponse.clone().json().catch(() => null);
        sessionPayload = authResponsePayload;
    }

    const response = await responseFromBackend(backendResponse, authResponsePayload, sessionPayload, isLogout || (backendResponse.status === 401 && !refreshed));
    return response;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request, context) {
    return proxy(request, context);
}
export function POST(request, context) {
    return proxy(request, context);
}
export function PUT(request, context) {
    return proxy(request, context);
}
export function PATCH(request, context) {
    return proxy(request, context);
}
export function DELETE(request, context) {
    return proxy(request, context);
}
