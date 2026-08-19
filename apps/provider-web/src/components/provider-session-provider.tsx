"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { AlertCircle, Building2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  canAccessProviderPermission,
  type ProviderAccountScope,
  type ProviderUser,
  parseProviderUser,
  providerAccountScope,
} from "@/lib/provider-auth";

interface ProviderSessionValue {
  canAccess: (permission: string) => boolean;
  isLoggingOut: boolean;
  logout: () => Promise<void>;
  scope: ProviderAccountScope;
  user: ProviderUser;
}

const ProviderSessionContext = createContext<ProviderSessionValue | null>(null);

function loginUrl(pathname: string) {
  const next = pathname.startsWith("/dashboard") ? pathname : "/dashboard/default";
  return `/auth/v1/login?next=${encodeURIComponent(next)}`;
}

export function ProviderSessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [user, setUser] = useState<ProviderUser | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const clearInvalidSession = useCallback(async () => {
    await fetch("/api/auth/logout", {
      body: "{}",
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
  }, []);

  const loadSession = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/auth/provider/me", {
          cache: "no-store",
          credentials: "include",
          headers: { accept: "application/json" },
          signal,
        });

        if (response.status === 401) {
          setUser(null);
          router.replace(loginUrl(`${window.location.pathname}${window.location.search}`));
          return;
        }

        const payload = (await response.json().catch(() => null)) as { message?: string; user?: unknown } | null;
        if (!response.ok) throw new Error(payload?.message ?? "The provider session could not be verified.");

        const providerUser = parseProviderUser(payload?.user);
        if (!providerUser) {
          await clearInvalidSession();
          setUser(null);
          router.replace("/auth/v1/login?error=provider_account_required");
          return;
        }

        setUser(providerUser);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "The provider session could not be verified.");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [clearInvalidSession, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        body: "{}",
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
    } finally {
      setUser(null);
      router.replace("/auth/v1/login?logged_out=1");
      router.refresh();
    }
  }, [isLoggingOut, router]);

  const value = useMemo<ProviderSessionValue | null>(() => {
    if (!user) return null;
    return {
      canAccess: (permission) => canAccessProviderPermission(user, permission),
      isLoggingOut,
      logout,
      scope: providerAccountScope(user),
      user,
    };
  }, [isLoggingOut, logout, user]);

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <Spinner />
          Checking provider session...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-muted">
              <Building2 className="size-5" />
            </span>
            <div>
              <h1 className="font-semibold">Provider workspace</h1>
              <p className="text-muted-foreground text-sm">Unable to verify the current session.</p>
            </div>
          </div>
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Session check failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button className="w-full" variant="outline" onClick={() => void loadSession()}>
            <RefreshCw />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!value) return null;
  return <ProviderSessionContext value={value}>{children}</ProviderSessionContext>;
}

export function useProviderSession() {
  const context = useContext(ProviderSessionContext);
  if (!context) throw new Error("useProviderSession must be used inside ProviderSessionProvider.");
  return context;
}
