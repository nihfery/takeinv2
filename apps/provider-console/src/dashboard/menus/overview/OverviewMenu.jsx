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
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  CircleDollarSign,
  MapPin,
  MoreHorizontal,
  Plus,
  Scissors,
  Tags,
  UsersRound,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, Status } from '../../components/common/DataDisplay';
import { isBranchAccount } from '../../config/navigation';
import { listFrom, money, statusLabel, today } from '../../lib/data';

const revenueConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  bookings: { label: 'Bookings', color: 'var(--chart-2)' },
};

const appointmentConfig = {
  appointments: { label: 'Appointments', color: 'var(--chart-1)' },
};

function dateValue(item) {
  return item?.booking_date || item?.starts_at || item?.created_at || item?.paid_at || '';
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function dayLabel(value, long = false) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', { weekday: long ? 'long' : 'short', timeZone: 'Asia/Jakarta' }).format(new Date(`${dateKey(value)}T12:00:00+07:00`));
}

function dateParts(value) {
  if (!value) return { day: '--', month: '---' };
  const date = new Date(`${dateKey(value)}T12:00:00+07:00`);
  return {
    day: new Intl.DateTimeFormat('en', { day: '2-digit', timeZone: 'Asia/Jakarta' }).format(date),
    month: new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'Asia/Jakarta' }).format(date),
  };
}

function startTime(item) {
  const value = item?.starts_at || item?.start_time || '';
  if (String(value).includes('T')) return String(value).slice(11, 16);
  return String(value).slice(0, 5) || '--:--';
}

function amountOf(item) {
  return Number(item?.amount_minor_units || item?.amount_minor || item?.total_price_minor_units || item?.payable_minor_units || 0);
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

function chartDates(days, bookings, payments) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - ((days - index - 1) * 86400000));
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const dayBookings = bookings.filter((item) => dateKey(dateValue(item)) === key);
    const dayPayments = payments.filter((item) => dateKey(dateValue(item)) === key && ['paid', 'settlement', 'success'].includes(String(item.status || '').toLowerCase()));
    return {
      key,
      day: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Asia/Jakarta' }).format(date),
      revenue: dayPayments.reduce((sum, item) => sum + amountOf(item), 0) / 100,
      bookings: dayBookings.length,
    };
  });
}

function upcomingDates(bookings) {
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(Date.now() + (index * 86400000));
    const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    return {
      key,
      day: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'Asia/Jakarta' }).format(date),
      appointments: bookings.filter((item) => dateKey(dateValue(item)) === key).length,
    };
  });
}

export default function OverviewMenu({ data, navigate, user }) {
  const [range, setRange] = useState('7');
  const [branch, setBranch] = useState('all');
  const [bookingStatus, setBookingStatus] = useState('all');
  const [scheduleTab, setScheduleTab] = useState('upcoming');
  const bookings = listFrom(data.bookings);
  const payments = listFrom(data.payments);
  const branches = listFrom(data.branches);
  const days = Number(range);
  const branchRestricted = isBranchAccount(user);
  const scopedBranch = branchRestricted ? String(user.branch_id) : branch;
  const visibleBranches = branchRestricted ? branches.filter((item) => String(item.id) === scopedBranch) : branches;

  const filteredBookings = useMemo(() => bookings.filter((item) => (
    withinLastDays(dateValue(item), days)
    && matchesBranch(item, scopedBranch)
    && (bookingStatus === 'all' || String(item.status || '').toLowerCase() === bookingStatus)
  )), [bookings, bookingStatus, scopedBranch, days]);

  const filteredPayments = useMemo(() => payments.filter((item) => withinLastDays(dateValue(item), days) && matchesBranch(item, scopedBranch)), [payments, scopedBranch, days]);
  const revenueData = useMemo(() => chartDates(days, filteredBookings, filteredPayments), [days, filteredBookings, filteredPayments]);
  const appointmentsData = useMemo(() => upcomingDates(bookings.filter((item) => matchesBranch(item, scopedBranch))), [bookings, scopedBranch]);
  const paidPayments = filteredPayments.filter((item) => ['paid', 'settlement', 'success'].includes(String(item.status || '').toLowerCase()));
  const paidAmount = paidPayments.reduce((sum, item) => sum + amountOf(item), 0);
  const activeBookings = filteredBookings.filter((item) => !['completed', 'cancelled', 'provider_cancelled', 'customer_cancelled', 'no_show'].includes(String(item.status || '').toLowerCase()));
  const todayKey = today();
  const todayBookings = bookings.filter((item) => dateKey(dateValue(item)) === todayKey && matchesBranch(item, scopedBranch));
  const upcomingBookings = bookings
    .filter((item) => dateKey(dateValue(item)) >= todayKey && matchesBranch(item, scopedBranch) && !['completed', 'cancelled', 'provider_cancelled', 'customer_cancelled', 'no_show'].includes(String(item.status || '').toLowerCase()))
    .sort((left, right) => String(dateValue(left)).localeCompare(String(dateValue(right))));
  const scheduleItems = (scheduleTab === 'today' ? todayBookings : upcomingBookings).slice(0, 4);
  const maxAppointments = Math.max(...appointmentsData.map((item) => item.appointments), 1);
  const pipeline = [
    { label: 'Scheduled', statuses: ['pending', 'confirmed', 'waiting', 'called'], tone: '[&_[data-slot=progress-indicator]]:bg-orange-500' },
    { label: 'Checked in', statuses: ['checked_in'], tone: '[&_[data-slot=progress-indicator]]:bg-orange-400' },
    { label: 'In service', statuses: ['in_progress'], tone: '[&_[data-slot=progress-indicator]]:bg-orange-300' },
    { label: 'Completed', statuses: ['completed'], tone: '[&_[data-slot=progress-indicator]]:bg-orange-200' },
  ].map((stage) => ({ ...stage, count: filteredBookings.filter((item) => stage.statuses.includes(String(item.status || '').toLowerCase())).length }));
  const pipelineTotal = Math.max(filteredBookings.length, 1);

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 rounded-lg border bg-background p-2.5 sm:flex-row sm:items-center sm:justify-between" aria-label="Dashboard filters">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger size="sm" className="min-w-32 bg-background"><CalendarRange className="text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scopedBranch} onValueChange={setBranch} disabled={branchRestricted}>
            <SelectTrigger size="sm" className="min-w-32 bg-background"><MapPin className="text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent align="start">
              {!branchRestricted ? <SelectItem value="all">All locations</SelectItem> : null}
              {visibleBranches.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.branch_name || item.name || `Location #${item.id}`}</SelectItem>)}
              {branchRestricted && !visibleBranches.length ? <SelectItem value={scopedBranch}>{`Branch #${scopedBranch}`}</SelectItem> : null}
            </SelectContent>
          </Select>
          <Select value={bookingStatus} onValueChange={setBookingStatus}>
            <SelectTrigger size="sm" className="min-w-32 bg-background"><Tags className="text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="checked_in">Checked in</SelectItem>
              <SelectItem value="in_progress">In service</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />Live data from Go services</div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.7fr)]">
        <Card className="min-w-0 gap-0 py-0 shadow-sm">
          <CardHeader className="border-b py-3.5">
            <div><CardTitle className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Recent sales</CardTitle><CardDescription className="mt-1 text-[10px]">Payment Service activity for the selected period.</CardDescription></div>
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Revenue card menu" />}><MoreHorizontal /></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuLabel>Revenue actions</DropdownMenuLabel><DropdownMenuItem onClick={() => navigate('payments')}>Open payments</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate('subscriptions')}>Manage subscription</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-2xl font-semibold tracking-tight sm:text-3xl">{money(paidAmount)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Last {days} days</p></div>
              <div className="flex items-center gap-2"><Badge variant="secondary" className="rounded-md">{paidPayments.length} paid</Badge><Badge variant="outline" className="rounded-md">{activeBookings.length} active</Badge></div>
            </div>
            <ChartContainer config={revenueConfig} className="mt-2 h-[220px] w-full aspect-auto">
              <AreaChart data={revenueData} margin={{ left: 4, right: 4, top: 18, bottom: 0 }} accessibilityLayer>
                <defs>
                  <linearGradient id="providerRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.22} /><stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} />
                <ChartTooltip cursor={{ strokeDasharray: '4 4' }} content={<ChartTooltipContent indicator="line" />} />
                <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="url(#providerRevenue)" strokeWidth={2} dot={false} />
                <Area dataKey="bookings" type="monotone" stroke="var(--color-bookings)" fill="transparent" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0 py-0 shadow-sm">
          <CardHeader className="border-b py-3.5">
            <div><CardTitle className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Upcoming appointments</CardTitle><CardDescription className="mt-1 text-[10px]">Five-day booking outlook.</CardDescription></div>
            <CardAction><Button variant="ghost" size="icon-xs" onClick={() => navigate('calendar')} aria-label="Open calendar"><ArrowUpRight /></Button></CardAction>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{appointmentsData.reduce((sum, item) => sum + item.appointments, 0)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Appointments scheduled</p>
            <ChartContainer config={appointmentConfig} className="mt-3 h-[220px] w-full aspect-auto">
              <BarChart data={appointmentsData} margin={{ left: 0, right: 0, top: 18, bottom: 0 }} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="appointments" fill="var(--color-appointments)" radius={[5, 5, 1, 1]} maxBarSize={22} />
              </BarChart>
            </ChartContainer>
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>Peak capacity</span><strong className="text-foreground">{maxAppointments} / day</strong></div>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 py-0 shadow-sm">
        <CardHeader className="border-b py-3.5">
          <div><CardTitle className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Appointment activity</CardTitle><CardDescription className="mt-1 text-[10px]">Schedule, booking pipeline, and upcoming queue.</CardDescription></div>
          <CardAction><Button size="xs" onClick={() => navigate('walk-in')}><Plus />Add walk-in</Button></CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid xl:grid-cols-[minmax(300px,.9fr)_minmax(300px,1fr)_minmax(270px,.7fr)]">
            <section className="min-w-0 border-b p-4 xl:border-b-0 xl:border-r" aria-labelledby="schedule-heading">
              <div className="mb-3 flex items-center justify-between"><div><h3 id="schedule-heading" className="text-xs font-medium">Schedule</h3><p className="mt-0.5 text-[10px] text-muted-foreground">Provider appointments</p></div><CalendarDays className="size-4 text-muted-foreground" /></div>
              <Tabs value={scheduleTab} onValueChange={setScheduleTab}>
                <TabsList className="h-7"><TabsTrigger value="today" className="text-[10px]">Today</TabsTrigger><TabsTrigger value="upcoming" className="text-[10px]">Upcoming</TabsTrigger></TabsList>
                {['today', 'upcoming'].map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-3">
                    {scheduleItems.length ? <div className="grid gap-2">{scheduleItems.map((item, index) => {
                      const date = dateParts(dateValue(item));
                      return (
                        <button key={item.id || index} className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/35" onClick={() => navigate('bookings')}>
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-center"><strong className="text-xs leading-none">{date.day}</strong><span className="text-[8px] uppercase text-muted-foreground">{date.month}</span></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{item.customer_name || item.customer_snapshot?.name || 'Walk-in customer'}</span><span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{startTime(item)} · {item.service_name || item.service_snapshot?.name || item.booking_code || `Booking #${item.id}`}</span></span>
                          <span className="text-[10px] font-medium">{money(amountOf(item))}</span>
                        </button>
                      );
                    })}</div> : <Empty title="No appointments" description="No bookings match this schedule." />}
                  </TabsContent>
                ))}
              </Tabs>
            </section>

            <section className="min-w-0 border-b p-4 xl:border-b-0 xl:border-r" aria-labelledby="pipeline-heading">
              <div className="mb-4 flex items-center justify-between"><div><h3 id="pipeline-heading" className="text-xs font-medium">Booking pipeline</h3><p className="mt-0.5 text-[10px] text-muted-foreground">Last {days} days conversion</p></div><Badge variant="outline" className="rounded-md">{filteredBookings.length} total</Badge></div>
              <div className="grid gap-4">
                {pipeline.map((stage) => {
                  const percentage = Math.round((stage.count / pipelineTotal) * 100);
                  return (
                    <Progress key={stage.label} value={percentage} className={`gap-1.5 ${stage.tone} [&_[data-slot=progress-track]]:h-2`}>
                      <ProgressLabel className="text-[11px]">{stage.label}</ProgressLabel>
                      <ProgressValue className="text-[10px]">{stage.count} · {percentage}%</ProgressValue>
                    </Progress>
                  );
                })}
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-3 gap-2">
                <div><p className="text-[9px] text-muted-foreground">Revenue</p><p className="mt-1 text-xs font-semibold">{money(paidAmount)}</p></div>
                <div><p className="text-[9px] text-muted-foreground">Bookings</p><p className="mt-1 text-xs font-semibold">{filteredBookings.length}</p></div>
                <div><p className="text-[9px] text-muted-foreground">Completed</p><p className="mt-1 text-xs font-semibold">{pipeline.find((item) => item.label === 'Completed')?.count || 0}</p></div>
              </div>
            </section>

            <section className="min-w-0 p-4" aria-labelledby="queue-heading">
              <div className="mb-3 flex items-center justify-between"><div><h3 id="queue-heading" className="text-xs font-medium">Upcoming queue</h3><p className="mt-0.5 text-[10px] text-muted-foreground">Next customer arrivals</p></div><Button variant="ghost" size="icon-xs" onClick={() => navigate('queue')} aria-label="Open queue"><ArrowUpRight /></Button></div>
              {upcomingBookings.length ? <div className="grid gap-1">{upcomingBookings.slice(0, 5).map((item, index) => (
                <button key={item.id || index} className="flex items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-muted/40" onClick={() => navigate('queue')}>
                  <Avatar className="size-7"><AvatarFallback className="bg-orange-50 text-[9px] font-semibold text-orange-700">{String(item.customer_name || item.customer_snapshot?.name || 'C').slice(0, 1)}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{item.customer_name || item.customer_snapshot?.name || 'Customer'}</span><span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground"><Scissors className="size-2.5" />{item.service_name || item.service_snapshot?.name || statusLabel(item.status)}</span></span>
                  <span className="text-right"><span className="block text-[10px] font-medium">{startTime(item)}</span><span className="text-[8px] text-muted-foreground">{dayLabel(dateValue(item))}</span></span>
                  <ChevronRight className="size-3 text-muted-foreground" />
                </button>
              ))}</div> : <Empty title="Queue is clear" description="Upcoming customers will appear here." />}
              <Button variant="ghost" size="xs" className="mt-2 w-full justify-center" onClick={() => navigate('bookings')}>View all bookings <ChevronRight /></Button>
            </section>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Active bookings', value: activeBookings.length, detail: 'Operational workload', icon: CalendarDays },
          { label: 'Paid transactions', value: paidPayments.length, detail: money(paidAmount), icon: CircleDollarSign },
          { label: branchRestricted ? 'Branch scope' : 'Locations', value: branchRestricted ? 1 : branches.length, detail: `${bookings.length} total bookings`, icon: UsersRound },
        ].map((item) => {
          const Icon = item.icon;
          return <Card key={item.label} size="sm" className="shadow-none"><CardContent className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-md bg-orange-50 text-orange-700"><Icon className="size-3.5" /></span><div><p className="text-[10px] text-muted-foreground">{item.label}</p><p className="mt-0.5 text-sm font-semibold">{item.value}</p></div><p className="ml-auto text-[9px] text-muted-foreground">{item.detail}</p></CardContent></Card>;
        })}
      </section>
    </div>
  );
}
