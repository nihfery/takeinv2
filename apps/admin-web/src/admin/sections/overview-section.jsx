import Link from 'next/link';
import { Activity, ArrowUpRight, CalendarCheck2, CircleDollarSign, Store, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listOf } from '@/api';
import { dateTime, money, nameOf, statusOf } from '../formatters';
import { AdminDataTable } from '../components/admin-data-table';
import { EntityCell } from '../components/entity-cell';
import { StatusBadge } from '../components/status-badge';

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <Card className="gap-4 py-5 shadow-none">
      <CardHeader className="px-5">
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <span className={`grid size-9 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
        </CardAction>
      </CardHeader>
      <CardContent className="px-5">
        <div className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ActivityChart({ values }) {
  const maximum = Math.max(...values.map((item) => item.value), 1);
  return (
    <div className="mt-7">
      <div className="takein-chart-grid flex h-56 items-end gap-3 border-b px-2 sm:gap-5 sm:px-5">
        {values.map((item) => (
          <div key={item.label} className="group flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-12 rounded-t-md bg-primary/85 transition-all group-hover:bg-primary"
              style={{ height: `${Math.max(7, (item.value / maximum) * 92)}%` }}
              title={`${item.label}: ${item.value}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-2 pt-3 sm:gap-5 sm:px-5">
        {values.map((item) => <span key={item.label} className="flex-1 truncate text-center text-[10px] text-muted-foreground sm:text-xs">{item.label}</span>)}
      </div>
    </div>
  );
}

export function OverviewSection({ data }) {
  const providers = listOf(data.providers);
  const customers = listOf(data.customers);
  const bookings = listOf(data.bookings);
  const services = listOf(data.services);
  const coupons = listOf(data.coupons);
  const activeProviders = providers.filter((item) => statusOf(item) === 'active').length;
  const pendingProviders = providers.filter((item) => ['pending', 'submitted'].includes(String(item.document_status || '').toLowerCase())).length;
  const paidRevenue = bookings
    .filter((item) => ['paid', 'settlement', 'completed'].includes(String(item.payment_status || item.status || '').toLowerCase()))
    .reduce((sum, item) => sum + Number(item.total_minor_units || item.total_price_minor_units || item.amount_minor_units || 0), 0);
  const activeRate = providers.length ? Math.round((activeProviders / providers.length) * 100) : 0;
  const recent = [
    ...providers.slice(0, 3).map((item) => ({ ...item, record_type: 'Provider', event_at: item.updated_at || item.created_at })),
    ...bookings.slice(0, 5).map((item) => ({ ...item, record_type: 'Booking', event_at: item.updated_at || item.created_at })),
  ].sort((a, b) => new Date(b.event_at || 0) - new Date(a.event_at || 0)).slice(0, 7);
  const activity = [
    { label: 'Providers', value: providers.length },
    { label: 'Customers', value: customers.length },
    { label: 'Bookings', value: bookings.length },
    { label: 'Services', value: services.length },
    { label: 'Coupons', value: coupons.length },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label="Total providers" value={providers.length} detail={`${activeProviders} currently active`} icon={Store} tone="bg-violet-100 text-violet-700" />
        <MetricCard label="Customers" value={customers.length} detail="Registered marketplace accounts" icon={UsersRound} tone="bg-sky-100 text-sky-700" />
        <MetricCard label="Bookings" value={bookings.length} detail="Across all connected providers" icon={CalendarCheck2} tone="bg-amber-100 text-amber-700" />
        <MetricCard label="Loaded revenue" value={money(paidRevenue)} detail="Paid and completed bookings" icon={CircleDollarSign} tone="bg-emerald-100 text-emerald-700" />
      </section>

      <Tabs defaultValue="activity" className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="activity"><Activity />Platform activity</TabsTrigger>
          <TabsTrigger value="verification"><Store />Provider health</TabsTrigger>
        </TabsList>
        <TabsContent value="activity">
          <Card className="shadow-none">
            <CardHeader>
              <div>
                <CardTitle>Marketplace distribution</CardTitle>
                <CardDescription>Current records loaded across the Go service boundary.</CardDescription>
              </div>
              <CardAction>
                <Button variant="outline" size="sm" render={<Link href="/admin/dashboard/audit" />}>
                  Audit log <ArrowUpRight />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent><ActivityChart values={activity} /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="verification">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>Provider verification</CardTitle>
                <CardDescription>Activation status for businesses on the platform.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {[
                  ['Active providers', activeProviders, 'text-emerald-600'],
                  ['Waiting review', pendingProviders, 'text-amber-600'],
                  ['Services listed', services.length, 'text-violet-600'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-xl border bg-muted/20 p-5">
                    <div className={`text-3xl font-semibold ${color}`}>{value}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{label}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="flex h-full min-h-56 items-center justify-center py-6">
                <div className="takein-ring" style={{ '--takein-ring-value': `${activeRate}%` }}>
                  <strong>{activeRate}%</strong>
                  <span>active</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AdminDataTable
        title="Recent activity"
        description="The latest provider and booking records returned by the platform."
        items={recent}
        columns={[
          { label: 'Record', render: (item) => <EntityCell title={nameOf(item)} subtitle={item.record_type} /> },
          { label: 'Reference', render: (item) => item.booking_code || item.provider_code || item.email || `#${item.id || '—'}` },
          { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
          { label: 'Updated', render: (item) => dateTime(item.event_at) },
        ]}
      />
    </div>
  );
}
