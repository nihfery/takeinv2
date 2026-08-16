import { AdminDataTable } from '../components/admin-data-table';
import { StatusBadge } from '../components/status-badge';
import { dateTime, money, statusOf } from '../formatters';

export function CouponsSection({ items, query }) {
  return (
    <AdminDataTable
      title="Promotion coupons"
      description="Review discount values, usage, validity, and campaign status."
      items={items}
      query={query}
      columns={[
        {
          label: 'Coupon',
          render: (item) => (
            <div className="min-w-44">
              <div className="font-mono font-semibold text-foreground">{item.code}</div>
              <div className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">{item.name || item.description || 'Promotion coupon'}</div>
            </div>
          ),
        },
        { label: 'Discount', render: (item) => (item.discount_type === 'percentage' ? `${item.discount_value}%` : money(item.discount_minor_units || item.discount_value)) },
        { label: 'Usage', render: (item) => `${item.used_count || 0} / ${item.usage_limit || '∞'}` },
        { label: 'Valid until', render: (item) => dateTime(item.ends_at || item.expires_at) },
        { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
      ]}
    />
  );
}
