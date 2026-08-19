import { AlertCircle, CalendarClock, DatabaseZap, LoaderCircle, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { money, statusLabel } from '../../lib/data';

const positive = new Set(['active', 'verified', 'completed', 'paid', 'settlement', 'success', 'checked_in']);
const warning = new Set(['pending', 'submitted', 'waiting', 'confirmed', 'called', 'in_progress']);
const negative = new Set(['inactive', 'rejected', 'cancelled', 'provider_cancelled', 'customer_cancelled', 'no_show', 'failed', 'expired']);

export function Metric({ label, value, detail, tone = 'mint', icon: Icon = TrendingUp }) {
  const tones = {
    mint: 'bg-muted text-muted-foreground',
    blue: 'bg-muted text-muted-foreground',
    peach: 'bg-muted text-muted-foreground',
    violet: 'bg-muted text-muted-foreground',
  };
  return (
    <Card className="gap-4 bg-linear-to-t from-primary/[0.035] to-card py-5">
      <CardHeader className="px-5"><CardDescription>{label}</CardDescription><span className={cn('grid size-9 place-items-center rounded-lg border', tones[tone] || tones.mint)}><Icon className="size-4" /></span></CardHeader>
      <CardContent className="px-5"><div className="text-3xl font-semibold tracking-tight">{value}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent>
    </Card>
  );
}

export function Status({ value }) {
  const normalized = String(value || 'unknown').toLowerCase();
  return (
    <Badge variant="outline" className={cn(
      'gap-1.5 rounded-full px-2.5 py-1 font-medium capitalize',
      positive.has(normalized) && 'border-emerald-200 bg-emerald-50 text-emerald-700',
      warning.has(normalized) && 'border-amber-200 bg-amber-50 text-amber-700',
      negative.has(normalized) && 'border-rose-200 bg-rose-50 text-rose-700',
    )}>
      <span className="size-1.5 rounded-full bg-current" />{statusLabel(normalized)}
    </Badge>
  );
}

export function Empty({ title = 'No data yet', description = 'Data will appear after the first transaction is created.' }) {
  return (
    <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
      <div><span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground"><DatabaseZap className="size-5" /></span><h3 className="font-medium">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p></div>
    </div>
  );
}

export function Loading() {
  return <div className="space-y-4" aria-label="Loading provider data"><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 rounded-xl" />)}</div><Skeleton className="h-[380px] rounded-xl" /></div>;
}

export function ErrorNotice({ message, retry }) {
  return <Alert variant="destructive"><AlertCircle /><AlertTitle>Unable to load data</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span><Button size="sm" variant="outline" onClick={retry}>Try again</Button></AlertDescription></Alert>;
}

function TableCard({ title = 'Records', description = 'Data returned by the connected Go service.', children, count }) {
  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b py-5"><div><div className="flex items-center gap-2"><CardTitle>{title}</CardTitle>{Number.isFinite(count) ? <Badge variant="secondary" className="rounded-full">{count}</Badge> : null}</div><CardDescription className="mt-1">{description}</CardDescription></div></CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

export function BookingTable({ items, onAction, actionBusy, queueMode = false }) {
  return (
    <TableCard title={queueMode ? 'Live queue' : 'Booking list'} description={queueMode ? 'Today’s customers and their current queue stage.' : 'Appointments returned by the Booking Service.'} count={items.length}>
      {!items.length ? <Empty title={queueMode ? 'Today’s queue is empty' : 'No bookings yet'} /> : (
        <Table>
          <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead>Booking</TableHead><TableHead>Customer</TableHead><TableHead>Schedule</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((item) => (
            <TableRow key={item.id}>
              <TableCell><div className="font-medium text-foreground">{item.booking_code || `#${item.id}`}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.booking_type || 'scheduled'}</div></TableCell>
              <TableCell><div className="font-medium text-foreground">{item.customer_name || item.customer_snapshot?.name || 'Walk-in customer'}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.customer_phone || item.customer_snapshot?.phone || '—'}</div></TableCell>
              <TableCell><div className="flex items-center gap-2"><CalendarClock className="size-4 text-muted-foreground" /><span><span className="block font-medium text-foreground">{item.booking_date || String(item.starts_at || '').slice(0, 10)}</span><span className="text-xs text-muted-foreground">{String(item.starts_at || '').slice(11, 16) || item.start_time || '—'}</span></span></div></TableCell>
              <TableCell><div className="font-medium text-foreground">{money(item.total_price_minor_units || item.total_minor || item.payable_minor_units)}</div><div className="mt-0.5 text-xs text-muted-foreground">{item.payment_type || '—'}</div></TableCell>
              <TableCell><Status value={item.status} /></TableCell>
              <TableCell><div className="flex justify-end gap-1.5">
                {queueMode && item.status === 'waiting' ? <Button size="xs" variant="outline" disabled={actionBusy === item.id} onClick={() => onAction(item.id, 'call')}>Call</Button> : null}
                {['confirmed', 'waiting', 'called'].includes(item.status) ? <Button size="xs" variant="secondary" disabled={actionBusy === item.id} onClick={() => onAction(item.id, 'check-in')}>Check in</Button> : null}
                {item.status === 'checked_in' ? <Button size="xs" disabled={actionBusy === item.id} onClick={() => onAction(item.id, 'start')}>Start</Button> : null}
                {item.status === 'in_progress' ? <Button size="xs" disabled={actionBusy === item.id} onClick={() => onAction(item.id, 'complete')}>{actionBusy === item.id ? <LoaderCircle className="animate-spin" /> : null}Complete</Button> : null}
              </div></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </TableCard>
  );
}

export function SimpleTable({ items, columns, emptyTitle, title = 'Records', description }) {
  return (
    <TableCard title={title} description={description} count={items.length}>
      {!items.length ? <Empty title={emptyTitle} /> : (
        <Table><TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35">{columns.map((column) => <TableHead key={column.label}>{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{items.map((item, index) => <TableRow key={item.id || index}>{columns.map((column) => <TableCell key={column.label}>{column.render ? column.render(item) : (item[column.key] ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table>
      )}
    </TableCard>
  );
}
