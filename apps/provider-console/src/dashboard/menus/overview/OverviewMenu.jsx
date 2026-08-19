'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
} from 'recharts';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  Clock3,
  MapPin,
  Scissors,
  TrendingDown,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, Status } from '../../components/common/DataDisplay';
import { isBranchAccount } from '../../config/navigation';
import { listFrom, money, today } from '../../lib/data';

const paidStatuses = new Set(['paid', 'settlement', 'success']);
const closedStatuses = new Set(['completed', 'cancelled', 'provider_cancelled', 'customer_cancelled', 'no_show']);
const performanceConfig = {
  revenue: { label: 'Paid revenue (million)', color: 'var(--chart-1)' },
  bookings: { label: 'Bookings', color: 'var(--chart-3)' },
};
const volumeConfig = {
  completed: { label: 'Completed', color: 'var(--chart-1)' },
  active: { label: 'Active', color: 'var(--chart-3)' },
};

function dateValue(item) {
  return item?.booking_date || item?.starts_at || item?.created_at || item?.paid_at || '';
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function amountOf(item) {
  return Number(item?.amount_minor_units || item?.amount_minor || item?.total_price_minor_units || item?.total_minor || item?.payable_minor_units || 0);
}

function withinLastDays(value, days) {
  const key = dateKey(value);
  if (!key) return true;
  const point = new Date(`${key}T12:00:00+07:00`).getTime();
  const end = Date.now() + 86400000;
  return point >= end - (days * 86400000) && point <= end;
}

function matchesBranch(item, branch) {
  return branch === 'all' || String(item?.branch_id || item?.location_id || '') === branch;
}

function initials(value) {
  return String(value || 'C').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function readableDate(item) {
  const value = dateValue(item);
  if (!value) return 'Not scheduled';
  const date = new Date(`${dateKey(value)}T12:00:00+07:00`);
  return Number.isNaN(date.getTime()) ? dateKey(value) : new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}

function startTime(item) {
  const value = String(item?.starts_at || item?.start_time || '');
  return value.includes('T') ? value.slice(11, 16) : (value.slice(0, 5) || '--:--');
}

function chartDates(days, bookings, payments) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - ((days - index - 1) * 86400000));
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const dailyBookings = bookings.filter((item) => dateKey(dateValue(item)) === key);
    const dailyPayments = payments.filter((item) => dateKey(dateValue(item)) === key && paidStatuses.has(String(item.status || '').toLowerCase()));
    return {
      key,
      day: new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' }).format(date),
      revenue: Number((dailyPayments.reduce((sum, item) => sum + amountOf(item), 0) / 100000000).toFixed(2)),
      bookings: dailyBookings.length,
    };
  });
}

function MetricCard({ label, value, detail, change, icon: Icon, negative = false }) {
  const TrendIcon = negative ? TrendingDown : TrendingUp;
  return (
    <Card className="bg-linear-to-t from-primary/[0.035] to-card">
      <CardHeader>
        <CardTitle><span className="grid size-7 place-items-center rounded-lg border bg-muted text-muted-foreground"><Icon className="size-4" /></span></CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2"><strong className="text-3xl font-medium leading-none tracking-tight tabular-nums">{value}</strong><Badge variant={negative ? 'destructive' : 'secondary'}><TrendIcon className="size-3" />{change}</Badge></div>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function OverviewMenu({ data, navigate, user }) {
  const [range, setRange] = useState('30');
  const [branch, setBranch] = useState('all');
  const bookings = listFrom(data.bookings);
  const payments = listFrom(data.payments);
  const branches = listFrom(data.branches);
  const staff = listFrom(data.staff);
  const services = listFrom(data.services);
  const notifications = listFrom(data.notifications);
  const days = Number(range);
  const branchRestricted = isBranchAccount(user);
  const scopedBranch = branchRestricted ? String(user.branch_id) : branch;
  const visibleBranches = branchRestricted ? branches.filter((item) => String(item.id) === scopedBranch) : branches;

  const filteredBookings = useMemo(() => bookings.filter((item) => withinLastDays(dateValue(item), days) && matchesBranch(item, scopedBranch)), [bookings, days, scopedBranch]);
  const filteredPayments = useMemo(() => payments.filter((item) => withinLastDays(dateValue(item), days) && matchesBranch(item, scopedBranch)), [payments, days, scopedBranch]);
  const performanceData = useMemo(() => chartDates(days, filteredBookings, filteredPayments), [days, filteredBookings, filteredPayments]);
  const paidPayments = filteredPayments.filter((item) => paidStatuses.has(String(item.status || '').toLowerCase()));
  const paidAmount = paidPayments.reduce((sum, item) => sum + amountOf(item), 0);
  const pendingAmount = filteredPayments.filter((item) => !paidStatuses.has(String(item.status || '').toLowerCase())).reduce((sum, item) => sum + amountOf(item), 0);
  const completedBookings = filteredBookings.filter((item) => String(item.status || '').toLowerCase() === 'completed');
  const activeBookings = filteredBookings.filter((item) => !closedStatuses.has(String(item.status || '').toLowerCase()));
  const todayBookings = bookings.filter((item) => dateKey(dateValue(item)) === today() && matchesBranch(item, scopedBranch));
  const activeStaff = staff.filter((item) => String(item.status || 'active').toLowerCase() === 'active');
  const customerCount = new Set(filteredBookings.map((item) => item.customer_id || item.customer_email || item.customer_phone || item.customer_snapshot?.email || item.customer_snapshot?.phone).filter(Boolean)).size;
  const completionRate = filteredBookings.length ? Math.round((completedBookings.length / filteredBookings.length) * 100) : 0;
  const recentBookings = [...filteredBookings].sort((left, right) => String(dateValue(right)).localeCompare(String(dateValue(left)))).slice(0, 7);
  const recentPayments = [...filteredPayments].sort((left, right) => String(dateValue(right)).localeCompare(String(dateValue(left)))).slice(0, 5);
  const chartInterval = Math.max(Math.ceil(days / 7) - 1, 0);
  const volumeData = performanceData.slice(-7).map((item) => ({ ...item, completed: completedBookings.filter((booking) => dateKey(dateValue(booking)) === item.key).length, active: activeBookings.filter((booking) => dateKey(dateValue(booking)) === item.key).length }));

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <header className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span>Provider</span><span>/</span><span className="font-medium text-foreground">Overview</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight">Provider dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Live operational data from TAKEIN Go microservices.</p></div>
        <div className="flex flex-wrap gap-2">
          <Select value={range} onValueChange={setRange}><SelectTrigger className="min-w-32"><CalendarRange /><SelectValue /></SelectTrigger><SelectContent align="end"><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem></SelectContent></Select>
          <Select value={scopedBranch} onValueChange={setBranch} disabled={branchRestricted}><SelectTrigger className="min-w-40"><MapPin /><SelectValue /></SelectTrigger><SelectContent align="end">{!branchRestricted ? <SelectItem value="all">All locations</SelectItem> : null}{visibleBranches.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.branch_name || item.name || `Location #${item.id}`}</SelectItem>)}{branchRestricted && !visibleBranches.length ? <SelectItem value={scopedBranch}>{`Branch #${scopedBranch}`}</SelectItem> : null}</SelectContent></Select>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Paid revenue" value={money(paidAmount)} detail={`${paidPayments.length} settled transactions`} change={`${days} days`} icon={CircleDollarSign} />
        <MetricCard label="Bookings" value={filteredBookings.length} detail={`${todayBookings.length} appointments today`} change={`${activeBookings.length} active`} icon={CalendarDays} />
        <MetricCard label="Unique customers" value={customerCount} detail="Customers in the selected period" change={`${completionRate}% done`} icon={UserRoundPlus} />
        <MetricCard label="Active team" value={activeStaff.length} detail={`${services.length} services available`} change={`${visibleBranches.length || 1} locations`} icon={UsersRound} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Provider performance</CardTitle>
          <CardDescription>Booking volume and paid revenue for the selected scope.</CardDescription>
          <CardAction><Button variant="outline" size="sm" onClick={() => navigate('payments')}>View report<ArrowUpRight /></Button></CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-x-7 gap-y-3 border-b pb-5"><div><p className="text-xs text-muted-foreground">Total earnings</p><p className="mt-1 text-xl font-semibold">{money(paidAmount)}</p></div><Separator orientation="vertical" className="hidden h-10 sm:block" /><div><p className="text-xs text-muted-foreground">Pending settlement</p><p className="mt-1 text-xl font-semibold">{money(pendingAmount)}</p></div><Separator orientation="vertical" className="hidden h-10 sm:block" /><div><p className="text-xs text-muted-foreground">Completion rate</p><p className="mt-1 text-xl font-semibold">{completionRate}%</p></div></div>
          <ChartContainer config={performanceConfig} className="h-80 w-full aspect-auto">
            <AreaChart data={performanceData} margin={{ left: 4, right: 4, top: 8 }} accessibilityLayer>
              <defs><linearGradient id="providerRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} /><stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={9} interval={chartInterval} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Area dataKey="revenue" type="natural" fill="url(#providerRevenue)" stroke="var(--color-revenue)" strokeWidth={1.5} dot={false} />
              <Area dataKey="bookings" type="natural" fill="transparent" stroke="var(--color-bookings)" strokeWidth={1.4} dot={false} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Recent appointments</CardTitle><CardDescription>Latest bookings returned by Booking Service.</CardDescription><CardAction><Button variant="outline" size="sm" onClick={() => navigate('bookings')}>All bookings<ArrowRight /></Button></CardAction></CardHeader>
          <CardContent className="px-0">
            {recentBookings.length ? <Table><TableHeader><TableRow><TableHead className="pl-4">Customer</TableHead><TableHead>Schedule</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{recentBookings.map((item, index) => { const customer = item.customer_name || item.customer_snapshot?.name || 'Walk-in customer'; return <TableRow key={item.id || index}><TableCell className="pl-4"><div className="flex items-center gap-2"><Avatar className="size-7"><AvatarFallback className="text-[9px]">{initials(customer)}</AvatarFallback></Avatar><span><strong className="block max-w-40 truncate text-xs">{customer}</strong><span className="block text-[10px] text-muted-foreground">{item.booking_code || `#${item.id}`}</span></span></div></TableCell><TableCell><span className="block text-xs font-medium">{readableDate(item)}</span><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" />{startTime(item)}</span></TableCell><TableCell><span className="flex max-w-40 items-center gap-1.5 truncate text-xs"><Scissors className="size-3 text-muted-foreground" />{item.service_name || item.service_snapshot?.name || item.booking_type || 'Service'}</span></TableCell><TableCell><Status value={item.status} /></TableCell><TableCell className="pr-4 text-right text-xs font-medium">{money(amountOf(item))}</TableCell></TableRow>; })}</TableBody></Table> : <Empty title="No appointments yet" description="New customer bookings will appear here." />}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle>Weekly activity</CardTitle><CardDescription>Appointment stages over seven days.</CardDescription></CardHeader>
            <CardContent><ChartContainer config={volumeConfig} className="h-40 w-full aspect-auto"><BarChart data={volumeData} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval={0} /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Bar dataKey="completed" stackId="volume" fill="var(--color-completed)" radius={[3, 3, 0, 0]} /><Bar dataKey="active" stackId="volume" fill="var(--color-active)" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Workspace status</CardTitle><CardDescription>Current operational scope.</CardDescription><CardAction><span className="size-2 rounded-full bg-emerald-500" /></CardAction></CardHeader>
            <CardContent className="grid gap-3 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Locations</span><strong>{visibleBranches.length || 1}</strong></div><Separator /><div className="flex justify-between"><span className="text-muted-foreground">Unread notifications</span><strong>{notifications.filter((item) => !item.read_at && !item.is_read).length}</strong></div><Separator /><div className="flex justify-between"><span className="text-muted-foreground">Go services</span><Badge variant="secondary">Connected</Badge></div></CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader><CardTitle>Recent transactions</CardTitle><CardDescription>Latest payment activity from Payment Service.</CardDescription><CardAction><Button variant="outline" size="sm" onClick={() => navigate('payments')}>Payments<WalletCards /></Button></CardAction></CardHeader>
        <CardContent>
          {recentPayments.length ? <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-5">{recentPayments.map((item, index) => <button key={item.id || index} type="button" className="flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => navigate('payments')}><span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><WalletCards className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{money(amountOf(item))}</strong><span className="block truncate text-[10px] text-muted-foreground">{readableDate(item)}</span></span><ArrowUpRight className="size-3.5 text-muted-foreground" /></button>)}</div> : <Empty title="No transactions yet" description="Paid and pending transactions will appear here." />}
        </CardContent>
      </Card>

      <footer className="flex flex-col justify-between gap-2 border-t pt-4 text-[10px] text-muted-foreground sm:flex-row"><span>© 2026 TAKEIN Provider</span><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" />Go microservices connected</span></footer>
    </div>
  );
}
