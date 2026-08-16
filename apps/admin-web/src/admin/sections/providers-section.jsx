import { BadgeCheck, Ban, CircleCheck, CircleX } from 'lucide-react';
import { AdminDataTable } from '../components/admin-data-table';
import { EntityCell } from '../components/entity-cell';
import { StatusBadge } from '../components/status-badge';
import { dateTime, nameOf, statusOf } from '../formatters';

export function ProvidersSection({ items, busy, query, requestAction }) {
  return (
    <AdminDataTable
      title="Provider directory"
      description="Review provider documents and control marketplace access."
      items={items}
      busy={busy}
      query={query}
      columns={[
        { label: 'Provider', render: (item) => <EntityCell title={nameOf(item)} subtitle={item.email || item.provider_code} /> },
        { label: 'Phone', render: (item) => item.phone_number || '—' },
        { label: 'Documents', render: (item) => <StatusBadge value={item.document_status} /> },
        { label: 'Account', render: (item) => <StatusBadge value={statusOf(item)} /> },
        { label: 'Created', render: (item) => dateTime(item.created_at) },
      ]}
      actions={(item) => {
        const active = statusOf(item) === 'active';
        return [
          {
            label: active ? 'Disable provider' : 'Enable provider',
            icon: active ? Ban : CircleCheck,
            destructive: active,
            onSelect: () => requestAction({
              key: `provider-${item.id}`,
              path: `/api/admin/providers/${item.id}/toggle-status`,
              options: { method: 'PATCH', body: {} },
              title: active ? 'Disable this provider?' : 'Enable this provider?',
              description: `${nameOf(item)} will ${active ? 'lose' : 'receive'} marketplace access.`,
              confirmLabel: active ? 'Disable provider' : 'Enable provider',
              destructive: active,
            }),
          },
          {
            label: 'Verify documents',
            icon: BadgeCheck,
            onSelect: () => requestAction({
              key: `verify-${item.id}`,
              path: `/api/admin/providers/${item.id}/document-status`,
              options: { method: 'PATCH', body: { status: 'verified', note: '' } },
              title: 'Verify provider documents?',
              description: `${nameOf(item)} will be marked as document verified.`,
              confirmLabel: 'Verify documents',
            }),
          },
          {
            label: 'Reject documents',
            icon: CircleX,
            destructive: true,
            onSelect: () => requestAction({
              key: `reject-${item.id}`,
              path: `/api/admin/providers/${item.id}/document-status`,
              options: { method: 'PATCH', body: { status: 'rejected', note: 'Documents need to be updated.' } },
              title: 'Reject provider documents?',
              description: `${nameOf(item)} will need to submit updated documents.`,
              confirmLabel: 'Reject documents',
              destructive: true,
            }),
          },
        ];
      }}
    />
  );
}
