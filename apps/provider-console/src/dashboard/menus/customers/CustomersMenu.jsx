import { CalendarPlus, Repeat2, UsersRound } from 'lucide-react';
import { dataOf } from '../../../api';
import { Metric, SimpleTable } from '../../components/common/DataDisplay';
import { asArray, money } from '../../lib/data';

export default function CustomersMenu({ data }) {
  const value = dataOf(data.customers, {});
  const summary = value?.summary || {};
  return <div className="space-y-5"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Total customers" value={summary.total_customers || 0} detail="Customers with bookings" icon={UsersRound} /><Metric label="Returning" value={summary.returning_customers || 0} detail="More than one booking" tone="blue" icon={Repeat2} /><Metric label="This month" value={summary.new_this_month || 0} detail="New active customers" tone="peach" icon={CalendarPlus} /></section><SimpleTable title="Customer directory" description="Customer activity scoped to your provider account." items={asArray(value?.customers)} emptyTitle="No customers yet" columns={[
    { label: 'Customer', render: (item) => <div><strong className="block font-medium text-foreground">{item.display_name || item.customer_code}</strong><small className="text-muted-foreground">{item.email}</small></div> },
    { label: 'Bookings', key: 'provider_bookings_count' }, { label: 'Total spent', render: (item) => money(item.provider_total_spent_minor_units) }, { label: 'Last booking', key: 'provider_last_booking_date' },
  ]} /></div>;
}
