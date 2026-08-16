import { BookingTable } from '../../components/common/DataDisplay';
import { listFrom } from '../../lib/data';

export default function BookingsMenu({ data, bookingAction, actionBusy }) {
  return <BookingTable items={listFrom(data.bookings)} onAction={bookingAction} actionBusy={actionBusy} />;
}
