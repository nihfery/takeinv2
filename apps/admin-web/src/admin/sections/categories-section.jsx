import { Sparkles, ToggleLeft } from 'lucide-react';
import { AdminDataTable } from '../components/admin-data-table';
import { StatusBadge } from '../components/status-badge';
import { nameOf, statusOf } from '../formatters';

export function CategoriesSection({ items, busy, query, requestAction }) {
  return (
    <AdminDataTable
      title="Service categories"
      description="Manage the taxonomy and featured categories used by customer discovery."
      items={items}
      busy={busy}
      query={query}
      columns={[
        {
          label: 'Category',
          render: (item) => (
            <div className="min-w-44">
              <div className="font-medium text-foreground">{item.name || item.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.slug || `#${item.id}`}</div>
            </div>
          ),
        },
        { label: 'Parent', render: (item) => item.parent_name || item.parent_id || 'Root' },
        { label: 'Featured', render: (item) => (item.is_featured || item.featured ? 'Yes' : 'No') },
        { label: 'Status', render: (item) => <StatusBadge value={statusOf(item)} /> },
      ]}
      actions={(item) => [
        {
          label: 'Toggle category status',
          icon: ToggleLeft,
          onSelect: () => requestAction({
            key: `category-${item.id}`,
            path: `/api/admin/service-categories/${item.id}/toggle-status`,
            options: { method: 'PATCH', body: {} },
            title: 'Change category status?',
            description: `${nameOf(item)} visibility will be changed across the marketplace.`,
            confirmLabel: 'Change status',
          }),
        },
        {
          label: 'Toggle featured',
          icon: Sparkles,
          onSelect: () => requestAction({
            key: `featured-${item.id}`,
            path: `/api/admin/service-categories/${item.id}/toggle-featured`,
            options: { method: 'PATCH', body: {} },
            title: 'Change featured category?',
            description: `${nameOf(item)} featured placement will be updated.`,
            confirmLabel: 'Update featured',
          }),
        },
      ]}
    />
  );
}
