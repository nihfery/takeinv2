import { Ban, CircleCheck } from 'lucide-react';
import { AdminDataTable } from '../components/admin-data-table';
import { EntityCell } from '../components/entity-cell';
import { StatusBadge } from '../components/status-badge';
import { money, nameOf, statusOf } from '../formatters';

export function ServicesSection({ items, busy, query, requestAction }) {
  return (
    <AdminDataTable
      title="Service catalog"
      description="Inspect provider services, pricing, categories, and visibility."
      items={items}
      busy={busy}
      query={query}
      columns={[
        { label: 'Service', render: (item) => <EntityCell title={item.title || item.name} subtitle={item.slug || `#${item.id}`} /> },
        { label: 'Provider', render: (item) => item.provider_name || item.provider_id || '—' },
        { label: 'Category', render: (item) => item.category_name || item.category_id || '—' },
        { label: 'Price', render: (item) => money(item.price_minor_units || item.price_minor) },
        { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
      ]}
      actions={(item) => {
        const active = statusOf(item) === 'active';
        return [{
          label: active ? 'Hide service' : 'Publish service',
          icon: active ? Ban : CircleCheck,
          destructive: active,
          onSelect: () => requestAction({
            key: `service-${item.id}`,
            path: `/api/admin/services/${item.id}/toggle-status`,
            options: { method: 'PATCH', body: {} },
            title: active ? 'Hide this service?' : 'Publish this service?',
            description: `${nameOf(item)} will ${active ? 'no longer be visible' : 'be visible'} in the marketplace.`,
            confirmLabel: active ? 'Hide service' : 'Publish service',
            destructive: active,
          }),
        }];
      }}
    />
  );
}
