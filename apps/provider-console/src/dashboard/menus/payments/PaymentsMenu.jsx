import { SimpleTable, Status } from '../../components/common/DataDisplay';
import { dateTime, listFrom, money } from '../../lib/data';

export default function PaymentsMenu({ data }) {
  return <SimpleTable title="Payment transactions" description="Booking payments returned by Payment Service." items={listFrom(data.payments)} emptyTitle="No payments yet" columns={[
    { label: 'Transaction', render: (item) => <div><strong className="block font-medium text-foreground">{item.gateway_order_id || `PAY-${item.id}`}</strong><small className="text-muted-foreground">Booking #{item.booking_id}</small></div> },
    { label: 'Type', key: 'payment_type' }, { label: 'Amount', render: (item) => money(item.amount_minor_units || item.amount_minor) },
    { label: 'Status', render: (item) => <Status value={item.status} /> }, { label: 'Created', render: (item) => dateTime(item.created_at) },
  ]} />;
}
