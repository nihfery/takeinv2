import OverviewMenu from './overview/OverviewMenu';
import BookingsMenu from './bookings/BookingsMenu';
import CalendarMenu from './calendar/CalendarMenu';
import QueueMenu from './queue/QueueMenu';
import WalkInMenu from './walk-in/WalkInMenu';
import ServicesMenu from './services/ServicesMenu';
import BranchesMenu from './branches/BranchesMenu';
import StaffMenu from './staff/StaffMenu';
import CustomersMenu from './customers/CustomersMenu';
import PaymentsMenu from './payments/PaymentsMenu';
import ReviewsMenu from './reviews/ReviewsMenu';
import ChatMenu from './chat/ChatMenu';
import NotificationsMenu from './notifications/NotificationsMenu';
import RolesMenu from './roles/RolesMenu';
import SubscriptionsMenu from './subscriptions/SubscriptionsMenu';
import ProfileMenu from './profile/ProfileMenu';
import { Empty } from '../components/common/DataDisplay';

export default function MenuRouter({ selected, data, user, navigate, reload, bookingAction, actionBusy, setError }) {
  const props = { data, user, navigate, reload, bookingAction, actionBusy, setError };
  switch (selected) {
    case 'overview': return <OverviewMenu {...props} />;
    case 'bookings': return <BookingsMenu {...props} />;
    case 'calendar': return <CalendarMenu {...props} />;
    case 'queue': return <QueueMenu {...props} />;
    case 'walk-in': return <WalkInMenu data={data} onCreated={() => navigate('queue')} />;
    case 'services': return <ServicesMenu {...props} />;
    case 'branches': return <BranchesMenu {...props} />;
    case 'staff': return <StaffMenu {...props} />;
    case 'customers': return <CustomersMenu {...props} />;
    case 'payments': return <PaymentsMenu {...props} />;
    case 'reviews': return <ReviewsMenu {...props} />;
    case 'chat': return <ChatMenu {...props} />;
    case 'notifications': return <NotificationsMenu {...props} />;
    case 'roles': return <RolesMenu {...props} />;
    case 'subscriptions': return <SubscriptionsMenu {...props} />;
    case 'profile': return <ProfileMenu {...props} />;
    default: return <Empty />;
  }
}
