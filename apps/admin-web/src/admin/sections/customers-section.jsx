import { Ban, CircleCheck } from 'lucide-react';
import { AdminDataTable } from '../components/admin-data-table';
import { EntityCell } from '../components/entity-cell';
import { StatusBadge } from '../components/status-badge';
import { dateTime, nameOf, statusOf } from '../formatters';

export function CustomersSection({ items, busy, query, requestAction }) {
  return (
    <AdminDataTable
      title="Customer accounts"
      description="Monitor registered customers and manage their platform access."
      items={items}
      busy={busy}
      query={query}
      columns={[
        { label: 'Customer', render: (item) => <EntityCell title={nameOf(item)} subtitle={item.email} /> },
        { label: 'Phone', render: (item) => item.phone_number || '—' },
        { label: 'Bookings', render: (item) => item.bookings_count ?? item.total_bookings ?? 0 },
        { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
        { label: 'Joined', render: (item) => dateTime(item.created_at) },
      ]}
      actions={(item) => {
        const active = statusOf(item) === 'active';
        return [{
          label: active ? 'Disable customer' : 'Enable customer',
          icon: active ? Ban : CircleCheck,
          destructive: active,
          onSelect: () => requestAction({
            key: `customer-${item.id}`,
            path: `/api/admin/customers/${item.id}/toggle-status`,
            options: { method: 'PATCH', body: {} },
            title: active ? 'Disable this customer?' : 'Enable this customer?',
            description: `${nameOf(item)} will ${active ? 'lose' : 'regain'} access to the customer application.`,
            confirmLabel: active ? 'Disable customer' : 'Enable customer',
            destructive: active,
          }),
        }];
      }}
    />
  );
}
