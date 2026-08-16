import {
  Bell,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LayoutDashboard,
  ListOrdered,
  MapPin,
  MessageCircle,
  Scissors,
  Settings2,
  ShieldCheck,
  Star,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react';

export const providerLoginUrl = process.env.NEXT_PUBLIC_PROVIDER_LOGIN_URL || '/provider/login';

export const navItems = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, permission: 'dashboard', audience: 'both', description: 'Monitor today’s bookings, revenue, and business activity.' },
  { key: 'bookings', label: 'Bookings', icon: CalendarDays, permission: 'bookings', audience: 'both', description: 'Manage customer appointments and booking progress.' },
  { key: 'calendar', label: 'Calendar', icon: Clock3, permission: 'calendar', audience: 'both', description: 'Review appointments across the current month.' },
  { key: 'queue', label: 'Queue', icon: ListOrdered, permission: 'queue', audience: 'both', description: 'Operate today’s live customer queue.' },
  { key: 'walk-in', label: 'Walk-in', icon: UserRoundPlus, permission: 'walk_in', audience: 'both', description: 'Create an offline appointment with slot validation.' },
  { key: 'services', label: 'Services', icon: Scissors, permission: 'services', audience: 'both', description: 'Manage the services available at your locations.' },
  { key: 'branches', label: 'Locations', icon: MapPin, permission: 'branch', audience: 'central', description: 'Manage business locations, contacts, and operating hours.' },
  { key: 'staff', label: 'Team', icon: UsersRound, permission: 'staffs', audience: 'both', description: 'Manage professionals working across your locations.' },
  { key: 'customers', label: 'Customers', icon: Building2, permission: 'customers', audience: 'both', description: 'Understand customers, visits, and total spending.' },
  { key: 'payments', label: 'Payments', icon: CircleDollarSign, permission: 'payments', audience: 'both', description: 'Review payment transactions and their settlement state.' },
  { key: 'reviews', label: 'Reviews', icon: Star, permission: 'reviews', audience: 'both', description: 'Monitor customer feedback for locations and professionals.' },
  { key: 'chat', label: 'Messages', icon: MessageCircle, permission: 'chat', audience: 'both', description: 'Continue booking conversations with customers.' },
  { key: 'notifications', label: 'Notifications', icon: Bell, permission: 'notifications', audience: 'both', description: 'Review operational updates from TAKEIN services.' },
  { key: 'roles', label: 'Access control', icon: ShieldCheck, permission: 'roles_permissions', audience: 'central', description: 'Create location accounts and configure menu access.' },
  { key: 'subscriptions', label: 'Subscription', icon: CreditCard, permission: 'subscriptions', audience: 'central', description: 'Review and purchase plans for your provider account.' },
  { key: 'profile', label: 'Business profile', icon: Settings2, permission: 'profile', audience: 'central', description: 'Review identity details and business verification.' },
];

export const navGroups = [
  { key: 'overview', label: 'Overview', keys: ['overview'] },
  { key: 'operations', label: 'Operations', keys: ['bookings', 'calendar', 'queue', 'walk-in'] },
  { key: 'business', label: 'Business', keys: ['services', 'branches', 'staff'] },
  { key: 'customers', label: 'Customers', keys: ['customers', 'reviews', 'chat', 'notifications'] },
  { key: 'finance', label: 'Finance', keys: ['payments', 'subscriptions'] },
  { key: 'settings', label: 'Settings', keys: ['roles', 'profile'] },
];

export function groupForSection(section) {
  return navGroups.find((group) => group.keys.includes(section)) || navGroups[0];
}

export function itemForSection(section) {
  return navItems.find((item) => item.key === section) || navItems[0];
}

export function routeFor(section) {
  return section === 'overview' ? '/provider/dashboard' : `/provider/dashboard/${section}`;
}

export function isBranchAccount(user) {
  return user?.branch_id !== null && user?.branch_id !== undefined && String(user.branch_id) !== '' && Number(user.branch_id) > 0;
}

export function accountScope(user) {
  const branch = isBranchAccount(user);
  return {
    type: branch ? 'branch' : 'central',
    label: branch ? `Branch #${user.branch_id}` : 'Head Office',
    description: branch ? 'Branch-scoped account' : 'Owner access across all branches',
  };
}

export function normalizedPermissions(user) {
  return Array.isArray(user?.permissions)
    ? [...new Set(user.permissions.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
}

export function canAccess(user, permission, audience = 'both') {
  if (!user) return false;
  if (!isBranchAccount(user)) return true;
  if (audience === 'central') return false;
  const permissions = normalizedPermissions(user);
  if (permission === 'customers' && permissions.includes('bookings')) return true;
  return permissions.includes(permission);
}

export function canAccessItem(user, item) {
  return Boolean(item) && canAccess(user, item.permission, item.audience);
}

export function visibleNavigation(user) {
  return navItems.filter((item) => canAccessItem(user, item));
}

export function navigationForGroup(items, group) {
  const keys = Array.isArray(group?.keys) ? group.keys : [];
  return (Array.isArray(items) ? items : []).filter((item) => keys.includes(item.key));
}

export const branchAssignableItems = navItems.filter((item) => item.audience === 'both');
