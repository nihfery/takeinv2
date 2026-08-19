'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, LogOut, ShieldX, Workflow } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, currentProvider, logoutProvider } from '../api';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ContentArea from './components/ContentArea';
import { navigateProvider, providerSectionFromPath } from './components/ProviderNavLink';
import { ErrorNotice, Loading } from './components/common/DataDisplay';
import { canAccessItem, groupForSection, itemForSection, navItems, providerLoginUrl, visibleNavigation } from './config/navigation';
import { monthRange, safeRequest, today } from './lib/data';
import MenuRouter from './menus/MenuRouter';

const bookingActionLabels = {
  call: 'Call customer',
  'check-in': 'Check in customer',
  start: 'Start service',
  complete: 'Complete booking',
};

export default function ProviderDashboard({ section = 'overview' }) {
  const router = useRouter();
  const pathname = usePathname();
  const selected = providerSectionFromPath(pathname, navItems.some((item) => item.key === section) ? section : 'overview');
  const [user, setUser] = useState(null);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(null);
  const [pendingBookingAction, setPendingBookingAction] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigate = useCallback((target) => navigateProvider(target), []);

  useEffect(() => {
    currentProvider().then((payload) => {
      if (payload?.user?.role !== 'provider') throw new Error('This account is not a provider account.');
      setUser(payload.user);
      sessionStorage.setItem('takein_provider_user', JSON.stringify(payload.user));
    }).catch(() => router.replace(providerLoginUrl)).finally(() => setSessionLoading(false));
  }, [router]);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('takein-provider-sidebar') === 'collapsed');
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem('takein-provider-sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!user || !canAccessItem(user, itemForSection(selected))) {
      setData({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const range = monthRange();
    const common = {
      profile: '/api/provider/profile',
      branches: '/api/provider/branches',
      staff: '/api/provider/staff',
      services: '/api/provider/services',
    };
    const endpoints = {
      overview: { branches: common.branches, bookings: '/api/provider/bookings', payments: '/api/provider/payments', services: common.services, staff: common.staff, chat: '/api/chat/threads', notifications: '/api/notifications' },
      bookings: { bookings: '/api/provider/bookings', branches: common.branches },
      calendar: { calendar: `/api/provider/bookings/calendar?from=${range.from}&to=${range.to}` },
      queue: { queue: `/api/provider/bookings/queue?date=${today()}` },
      'walk-in': { branches: common.branches, staff: common.staff, services: common.services },
      services: { services: common.services, branches: common.branches },
      branches: { branches: common.branches },
      staff: { staff: common.staff, branches: common.branches, categories: '/api/categories?per_page=100' },
      customers: { customers: '/api/provider/customers' },
      payments: { payments: '/api/provider/payments' },
      reviews: { reviews: '/api/provider/reviews' },
      chat: { chat: '/api/chat/threads' },
      notifications: { notifications: '/api/notifications' },
      roles: { roles: '/api/provider/roles-permissions', branches: common.branches },
      subscriptions: { subscriptions: '/api/provider/subscriptions' },
      profile: { profile: common.profile },
    };
    try {
      const pairs = Object.entries(endpoints[selected] || endpoints.overview);
      const values = await Promise.all(pairs.map(async ([key, path]) => [key, await safeRequest(path)]));
      setData(Object.fromEntries(values));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [selected, user]);

  useEffect(() => { load(); }, [load]);

  function bookingAction(id, action) {
    setPendingBookingAction({ id, action, label: bookingActionLabels[action] || 'Update booking' });
  }

  async function applyBookingAction() {
    if (!pendingBookingAction || actionBusy) return;
    const { id, action } = pendingBookingAction;
    setActionBusy(id);
    try {
      await apiRequest(`/api/provider/bookings/${id}/${action}`, { method: 'POST', body: {} });
      setPendingBookingAction(null);
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setActionBusy(null);
    }
  }

  async function signOut() {
    await logoutProvider().catch(() => {});
    router.replace(providerLoginUrl);
    router.refresh();
  }

  const visibleItems = useMemo(() => visibleNavigation(user), [user]);
  const sectionAllowed = !user || visibleItems.some((item) => item.key === selected);

  useEffect(() => {
    if (!user || sectionAllowed || !visibleItems.length) return;
    navigateProvider(visibleItems[0].key, { replace: true });
  }, [sectionAllowed, user, visibleItems]);

  if (sessionLoading) return <div className="grid min-h-screen place-items-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking provider session...</div></div>;
  if (!user) return null;
  if (!visibleItems.length) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/20 p-6">
        <Card className="w-full max-w-md text-center shadow-sm">
          <CardHeader><span className="mx-auto mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><ShieldX /></span><CardTitle>No menu access assigned</CardTitle><CardDescription>This branch account is active, but Head Office has not assigned any provider menu permissions yet.</CardDescription></CardHeader>
          <CardContent><Button variant="outline" onClick={signOut}><LogOut />Sign out</Button></CardContent>
        </Card>
      </div>
    );
  }
  if (!sectionAllowed) return <div className="grid min-h-screen place-items-center"><div className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Opening an allowed workspace...</div></div>;

  const activeGroup = groupForSection(selected);
  const content = loading
    ? <Loading />
    : error
      ? <ErrorNotice message={error} retry={load} />
      : <MenuRouter selected={selected} data={data} user={user} navigate={navigate} reload={load} bookingAction={bookingAction} actionBusy={actionBusy} setError={setError} />;

  return (
    <div className="provider-console-surface min-h-screen bg-background">
      <Topbar
        user={user}
        visibleItems={visibleItems}
        activeGroup={activeGroup}
        selected={selected}
        signOut={signOut}
        loading={loading}
        reload={load}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />
      <Sidebar selected={selected} user={user} signOut={signOut} activeGroup={activeGroup} visibleItems={visibleItems} collapsed={sidebarCollapsed} />
      <ContentArea selected={selected} sidebarCollapsed={sidebarCollapsed}>{content}</ContentArea>

      <AlertDialog open={Boolean(pendingBookingAction)} onOpenChange={(open) => { if (!open && !actionBusy) setPendingBookingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary"><Workflow /></AlertDialogMedia>
            <AlertDialogTitle>{pendingBookingAction?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This advances booking #{pendingBookingAction?.id} to the next operational stage in Booking Service.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(actionBusy)}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(actionBusy)} onClick={applyBookingAction}>{actionBusy ? <LoaderCircle className="animate-spin" /> : null}{actionBusy ? 'Applying...' : 'Confirm action'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
