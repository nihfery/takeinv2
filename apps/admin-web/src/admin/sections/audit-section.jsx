import { AdminDataTable } from '../components/admin-data-table';
import { dateTime } from '../formatters';

export function AuditSection({ items, query }) {
  return (
    <AdminDataTable
      title="Audit trail"
      description="Immutable administrative and platform activity returned by the audit service."
      items={items}
      query={query}
      columns={[
        { label: 'Time', render: (item) => dateTime(item.created_at) },
        { label: 'Actor', render: (item) => item.actor_email || item.actor_id || 'system' },
        {
          label: 'Action',
          render: (item) => (
            <div className="min-w-44">
              <div className="font-medium text-foreground">{item.action || item.event_type || 'Platform event'}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{item.resource_type || 'resource'}</div>
            </div>
          ),
        },
        { label: 'Resource', render: (item) => item.resource_id || item.aggregate_id || '—' },
        { label: 'Provider', render: (item) => item.provider_id || '—' },
      ]}
    />
  );
}
