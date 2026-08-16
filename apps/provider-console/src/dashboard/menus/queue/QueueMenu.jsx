import { BookingTable } from '../../components/common/DataDisplay';
import { listFrom } from '../../lib/data';

export default function QueueMenu({ data, bookingAction, actionBusy }) {
  return <BookingTable items={listFrom(data.queue)} onAction={bookingAction} actionBusy={actionBusy} queueMode />;
}
