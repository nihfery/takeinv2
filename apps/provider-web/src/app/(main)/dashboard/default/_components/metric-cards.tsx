import { CalendarCheck2, Scissors, TrendingUp, Users, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProviderMetricSummary } from "../_data/provider-dashboard";

const rupiah = new Intl.NumberFormat("id-ID", {
  currency: "IDR",
  maximumFractionDigits: 0,
  notation: "compact",
  style: "currency",
});

function MetricBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge>
      <TrendingUp className="size-3" />
      {children}
    </Badge>
  );
}

export function MetricCards({ metrics }: { metrics: ProviderMetricSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <WalletCards className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Paid Revenue</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {rupiah.format(metrics.revenueMinor / 100)}
            </div>
            <MetricBadge>{metrics.paidPayments} paid</MetricBadge>
          </div>
          <p className="text-muted-foreground text-sm">Settled booking payments from Go payment-service</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <CalendarCheck2 className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Bookings</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {metrics.totalBookings.toLocaleString("en-US")}
            </div>
            <MetricBadge>{metrics.upcomingBookings} upcoming</MetricBadge>
          </div>
          <p className="text-muted-foreground text-sm">{metrics.todayBookings} appointments scheduled today</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Users className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Customers</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {metrics.totalCustomers.toLocaleString("en-US")}
            </div>
            <MetricBadge>{metrics.returningCustomers} returning</MetricBadge>
          </div>
          <p className="text-muted-foreground text-sm">Unique customers in this provider workspace</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Scissors className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Active Services</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {metrics.activeServices.toLocaleString("en-US")}
            </div>
            <MetricBadge>{metrics.totalServices} total</MetricBadge>
          </div>
          <p className="text-muted-foreground text-sm">
            Across {metrics.activeBranches} active branches and {metrics.activeStaff} active staff
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
