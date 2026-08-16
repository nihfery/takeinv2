import { BadgeCheck, CheckCheck, XCircle } from 'lucide-react';
import { AdminDataTable } from '../components/admin-data-table';
import { StatusBadge } from '../components/status-badge';
import { dateTime, money, statusOf } from '../formatters';

export function BookingsSection({ items, busy, query, requestAction }) {
  const statusAction = (item, status, label, icon, destructive = false) => ({
    label,
    icon,
    destructive,
    onSelect: () => requestAction({
      key: `booking-${item.id}-${status}`,
      path: `/api/admin/bookings/${item.id}/status`,
      options: { method: 'PATCH', body: { status } },
      title: `${label}?`,
      description: `Booking ${item.booking_code || `#${item.id}`} will be changed to ${status}.`,
      confirmLabel: label,
      destructive,
    }),
  });

  return (
    <AdminDataTable
      title="Booking operations"
      description="Track appointments and update their operational status."
      items={items}
      busy={busy}
      query={query}
      columns={[
        {
          label: 'Booking',
          render: (item) => (
            <div className="min-w-36">
              <div className="font-medium text-foreground">{item.booking_code || `#${item.id}`}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.booking_type || item.mode || 'Appointment'}</div>
            </div>
          ),
        },
        { label: 'Provider / branch', render: (item) => `${item.provider_name || item.provider_id || '—'} / ${item.branch_name || item.branch_id || '—'}` },
        { label: 'Customer', render: (item) => item.customer_name || item.customer_id || '—' },
        { label: 'Schedule', render: (item) => item.booking_date || dateTime(item.starts_at) },
        { label: 'Total', render: (item) => money(item.total_minor_units || item.total_price_minor_units) },
        { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
      ]}
      actions={(item) => [
        statusAction(item, 'confirmed', 'Confirm booking', BadgeCheck),
        statusAction(item, 'completed', 'Complete booking', CheckCheck),
        statusAction(item, 'cancelled', 'Cancel booking', XCircle, true),
      ]}
    />
  );
}
