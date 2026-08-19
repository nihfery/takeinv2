"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, LogIn, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { loadProviderDashboard, ProviderApiError, type ProviderDashboardSnapshot } from "../_data/provider-dashboard";
import { MetricCards } from "./metric-cards";
import { PerformanceOverview } from "./performance-overview";
import { SubscriberOverview } from "./subscriber-overview";

const providerLoginUrl = process.env.NEXT_PUBLIC_PROVIDER_LOGIN_URL || "/auth/v1/login";
const skeletonCards = ["bookings", "revenue", "customers", "services"] as const;

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-label="Loading provider dashboard" role="status">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {skeletonCards.map((card) => (
          <Card key={card}>
            <CardHeader>
              <Skeleton className="size-7" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-44" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardUnavailable({ error, retry }: { error: Error; retry: () => void }) {
  const requiresLogin = error instanceof ProviderApiError && [401, 403].includes(error.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-amber-600" />
          Provider dashboard unavailable
        </CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {requiresLogin ? (
          <Button render={<a href={providerLoginUrl} />}>
            <LogIn />
            Sign in as provider
          </Button>
        ) : null}
        <Button variant="outline" onClick={retry}>
          <RefreshCw />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

export function ProviderDashboard() {
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshot, setSnapshot] = useState<ProviderDashboardSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey intentionally starts a fresh request.
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setError(null);

    loadProviderDashboard(controller.signal)
      .then(setSnapshot)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason : new Error("The provider dashboard could not be loaded."));
      });

    return () => controller.abort();
  }, [reloadKey]);

  if (error) return <DashboardUnavailable error={error} retry={() => setReloadKey((value) => value + 1)} />;
  if (!snapshot) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {snapshot.warnings.length ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Some live data is unavailable</AlertTitle>
          <AlertDescription>{snapshot.warnings.join(" ")}</AlertDescription>
        </Alert>
      ) : null}
      <MetricCards metrics={snapshot.metrics} />
      <PerformanceOverview data={snapshot.chart} providerName={snapshot.providerName} />
      <SubscriberOverview
        data={snapshot.customers}
        totalBookings={snapshot.customerTotalBookings}
        totalCustomers={snapshot.metrics.totalCustomers}
      />
    </div>
  );
}
