import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "takein_provider_access_token";
const REFRESH_COOKIE = "takein_provider_refresh_token";
const LEGACY_ACCESS_COOKIE = "takein_access_token";
const LEGACY_REFRESH_COOKIE = "takein_refresh_token";
const REMEMBER_COOKIE = "takein_provider_remember";
const PORTAL_ROLE = "provider";
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

interface SessionPayload extends Record<string, unknown> {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

interface ProxyContext {
  params: Promise<{ path?: string[] }>;
}

function origin(name: "GO_API_BASE_URL" | "GO_IDENTITY_URL", fallback: string) {
  return String(process.env[name] || fallback).replace(/\/$/, "");
}

function cookieOptions(maxAge?: number) {
  const options = {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.TAKEIN_COOKIE_SECURE === "true",
  };
  return maxAge === undefined ? options : { ...options, maxAge };
}

function proxyHeaders(request: NextRequest, accessToken: string) {
  const headers = new Headers();

  for (const name of ["accept", "content-type", "idempotency-key", "x-correlation-id", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("x-forwarded-host", request.headers.get("host") || "");
  headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  return headers;
}

async function callBackend(request: NextRequest, path: string[], accessToken: string, body?: BodyInit) {
  const target = new URL(`${origin("GO_API_BASE_URL", "http://127.0.0.1:8088")}/api/${path.join("/")}`);
  target.search = request.nextUrl.search;

  return fetch(target, {
    body,
    cache: "no-store",
    headers: proxyHeaders(request, accessToken),
    method: request.method,
    redirect: "manual",
  });
}

async function refresh(refreshToken: string): Promise<SessionPayload | null> {
  if (!refreshToken) return null;

  let response: Response;
  try {
    response = await fetch(`${origin("GO_IDENTITY_URL", "http://127.0.0.1:18081")}/internal/v1/auth/refresh`, {
      body: JSON.stringify({ refresh_token: refreshToken, role: PORTAL_ROLE }),
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as SessionPayload | null;
  return payload?.access_token &&
    payload.refresh_token &&
    payload.user &&
    typeof payload.user === "object" &&
    "role" in payload.user &&
    payload.user.role === PORTAL_ROLE
    ? payload
    : null;
}

function cleanAuthPayload(payload: SessionPayload | null) {
  if (!payload) return payload;

  const clean = { ...payload };
  delete clean.token;
  delete clean.access_token;
  delete clean.refresh_token;
  return clean;
}

async function toResponse(
  backend: Response,
  authPayload: SessionPayload | null,
  session: SessionPayload | null,
  clearSession: boolean,
  rememberSession: boolean,
) {
  const headers = new Headers({ "cache-control": "no-store" });

  for (const name of ["content-type", "location", "content-disposition"]) {
    const value = backend.headers.get(name);
    if (value) headers.set(name, value);
  }

  const backendBody = await backend.arrayBuffer();
  let body: BodyInit | null = backendBody.byteLength ? backendBody : null;
  if (authPayload) body = JSON.stringify(cleanAuthPayload(authPayload));
  if (authPayload) headers.set("content-type", "application/json");

  const response = new NextResponse(body, { headers, status: backend.status });

  if (session?.access_token && session.refresh_token) {
    response.cookies.set(
      ACCESS_COOKIE,
      session.access_token,
      cookieOptions(rememberSession ? Number(session.expires_in) || ACCESS_MAX_AGE : undefined),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      session.refresh_token,
      cookieOptions(rememberSession ? REFRESH_MAX_AGE : undefined),
    );
    if (rememberSession) response.cookies.set(REMEMBER_COOKIE, "1", cookieOptions(REFRESH_MAX_AGE));
    else response.cookies.set(REMEMBER_COOKIE, "", cookieOptions(0));
  }

  if (clearSession) {
    response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
    response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
    response.cookies.set(REMEMBER_COOKIE, "", cookieOptions(0));
  }
  response.cookies.set(LEGACY_ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(LEGACY_REFRESH_COOKIE, "", cookieOptions(0));

  return response;
}

function portalAuthBody(route: string, body?: ArrayBuffer) {
  if (route !== "auth/login" || !body?.byteLength) return body;
  try {
    const payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    return JSON.stringify({ ...payload, role: PORTAL_ROLE });
  } catch {
    return body;
  }
}

async function proxy(request: NextRequest, context: ProxyContext) {
  const { path = [] } = await context.params;
  const route = path.join("/");
  const backendPath = route === "auth/me" ? ["auth", PORTAL_ROLE, "me"] : path;
  if (route === "auth/register/customer") {
    return NextResponse.json(
      { message: "Customer registration is not available through the provider portal." },
      { status: 403 },
    );
  }
  const isAuth = ["auth/login", "auth/register/provider"].includes(route);
  const isLogout = route === "auth/logout";
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value || "";
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value || "";
  let rememberSession = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  const originalBody = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  if (route === "auth/login" && originalBody?.byteLength) {
    try {
      const loginPayload = JSON.parse(new TextDecoder().decode(originalBody)) as { remember?: unknown };
      rememberSession = loginPayload.remember === true;
    } catch {
      rememberSession = false;
    }
  }
  let body: BodyInit | undefined = portalAuthBody(route, originalBody);
  if (isLogout) body = JSON.stringify({ refresh_token: refreshToken });

  let backend: Response;
  try {
    backend = await callBackend(request, backendPath, accessToken, body);
  } catch {
    if (isLogout) {
      backend = Response.json({ message: "Local provider session cleared." });
      return toResponse(backend, null, null, true, rememberSession);
    }

    return NextResponse.json(
      { message: "The Go API is currently unreachable. Please try again." },
      { headers: { "cache-control": "no-store" }, status: 502 },
    );
  }
  let session: SessionPayload | null = null;

  if (backend.status === 401 && refreshToken && !isAuth && !isLogout) {
    session = await refresh(refreshToken);
    if (session?.access_token) {
      accessToken = session.access_token;
      try {
        backend = await callBackend(request, backendPath, accessToken, body);
      } catch {
        return NextResponse.json(
          { message: "The Go API is currently unreachable. Please try again." },
          { headers: { "cache-control": "no-store" }, status: 502 },
        );
      }
    }
  }

  let authPayload: SessionPayload | null = null;
  if (isAuth && backend.ok) {
    authPayload = (await backend
      .clone()
      .json()
      .catch(() => null)) as SessionPayload | null;
    const user = authPayload?.user;
    if (user && typeof user === "object" && "role" in user && user.role === PORTAL_ROLE) {
      session = authPayload;
    } else {
      backend = Response.json({ message: "This account cannot sign in to the provider portal." }, { status: 403 });
      authPayload = null;
      session = null;
    }
  }

  return toResponse(backend, authPayload, session, isLogout || (backend.status === 401 && !session), rememberSession);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
