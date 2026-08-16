import {
  CalendarDays,
  LayoutDashboard,
  Layers3,
  Scissors,
  ShieldCheck,
  Store,
  TicketPercent,
  UsersRound,
} from 'lucide-react';

export const navigationGroups = [
  {
    label: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { key: 'providers', label: 'Providers', icon: Store },
      { key: 'customers', label: 'Customers', icon: UsersRound },
      { key: 'bookings', label: 'Bookings', icon: CalendarDays },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { key: 'services', label: 'Services', icon: Scissors },
      { key: 'categories', label: 'Categories', icon: Layers3 },
      { key: 'coupons', label: 'Coupons', icon: TicketPercent },
    ],
  },
  {
    label: 'Governance',
    items: [
      { key: 'audit', label: 'Audit log', icon: ShieldCheck },
    ],
  },
];

export const navigation = navigationGroups.flatMap((group) => group.items);

export const endpoints = {
  providers: '/api/admin/providers',
  customers: '/api/admin/customers',
  bookings: '/api/admin/bookings',
  services: '/api/admin/services',
  categories: '/api/admin/service-categories',
  coupons: '/api/admin/coupons',
  audit: '/api/admin/audit?limit=200',
};

export function routeFor(section) {
  return section === 'overview' ? '/admin/dashboard' : `/admin/dashboard/${section}`;
}

export function navigationItem(section) {
  return navigation.find((item) => item.key === section) || navigation[0];
}
