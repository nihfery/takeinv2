import { SimpleTable, Status } from '../../components/common/DataDisplay';
import { listFrom } from '../../lib/data';

export default function CalendarMenu({ data }) {
  return <SimpleTable title="Monthly calendar" description="Appointments scheduled during the current month." items={listFrom(data.calendar)} emptyTitle="This month’s calendar is empty" columns={[
    { label: 'Date', render: (item) => <div><strong className="block font-medium text-foreground">{item.booking_date}</strong><small className="text-muted-foreground">{String(item.starts_at || '').slice(11, 16)}</small></div> },
    { label: 'Booking', render: (item) => <div><strong className="block font-medium text-foreground">{item.booking_code}</strong><small className="text-muted-foreground">{item.customer_name || 'Customer'}</small></div> },
    { label: 'Status', render: (item) => <Status value={item.status} /> },
  ]} />;
}
