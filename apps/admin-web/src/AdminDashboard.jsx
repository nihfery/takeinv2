'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest, currentAdmin, listOf, logoutAdmin } from './api';
import { AdminHeader } from './admin/components/admin-header';
import { AdminSidebar } from './admin/components/admin-sidebar';
import { ConfirmActionDialog } from './admin/components/confirm-action-dialog';
import { endpoints, navigation, navigationItem } from './admin/navigation';
import { AuditSection } from './admin/sections/audit-section';
import { BookingsSection } from './admin/sections/bookings-section';
import { CategoriesSection } from './admin/sections/categories-section';
import { CouponsSection } from './admin/sections/coupons-section';
import { CustomersSection } from './admin/sections/customers-section';
import { OverviewSection } from './admin/sections/overview-section';
import { ProvidersSection } from './admin/sections/providers-section';
import { ServicesSection } from './admin/sections/services-section';

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading dashboard data">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)}
      </div>
      <Skeleton className="h-[420px] rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

const sectionDescriptions = {
  overview: 'A live operational view across the TAKEIN Go service boundary.',
  providers: 'Verify businesses, control access, and monitor provider onboarding.',
  customers: 'Review registered customer accounts and marketplace activity.',
  bookings: 'Manage appointments across every provider and branch.',
  services: 'Control service visibility, pricing, and marketplace availability.',
  categories: 'Organize customer discovery and featured service categories.',
  coupons: 'Monitor promotion rules, usage limits, and campaign validity.',
  audit: 'Trace administrative and platform events from the audit service.',
};

export default function AdminDashboard({ section = 'overview' }) {
  const selected = navigation.some((item) => item.key === section) ? section : 'overview';
  const selectedItem = navigationItem(selected);
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    currentAdmin()
      .then((payload) => {
        if (payload?.user?.role !== 'admin') throw new Error('Administrator role required.');
        setUser(payload.user);
      })
      .catch(() => window.location.replace('/admin/login'))
      .finally(() => setSessionLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrors([]);
    const requested = selected === 'overview' ? Object.entries(endpoints) : [[selected, endpoints[selected]]];
    const result = await Promise.all(requested.map(async ([key, path]) => {
      try {
        return [key, await apiRequest(path), null];
      } catch (error) {
        return [key, null, `${key}: ${error.message}`];
      }
    }));
    setData(Object.fromEntries(result.map(([key, payload]) => [key, payload])));
    setErrors(result.map(([, , error]) => error).filter(Boolean));
    setLoading(false);
  }, [selected, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQuery(''); }, [selected]);

  async function applyPendingAction() {
    if (!pendingAction || busy) return;
    setBusy(pendingAction.key);
    setErrors([]);
    try {
      await apiRequest(pendingAction.path, pendingAction.options);
      setPendingAction(null);
      await load();
    } catch (error) {
      setErrors([error.message]);
    } finally {
      setBusy('');
    }
  }

  async function signOut() {
    await logoutAdmin().catch(() => {});
    window.location.replace('/admin/login');
  }

  const filteredItems = useMemo(() => {
    const items = listOf(data[selected]);
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(needle)) : items;
  }, [data, query, selected]);

  function sectionContent() {
    const shared = { items: filteredItems, busy, query, requestAction: setPendingAction };
    if (selected === 'overview') return <OverviewSection data={data} />;
    if (selected === 'providers') return <ProvidersSection {...shared} />;
    if (selected === 'customers') return <CustomersSection {...shared} />;
    if (selected === 'bookings') return <BookingsSection {...shared} />;
    if (selected === 'services') return <ServicesSection {...shared} />;
    if (selected === 'categories') return <CategoriesSection {...shared} />;
    if (selected === 'coupons') return <CouponsSection {...shared} />;
    return <AuditSection {...shared} />;
  }

  if (sessionLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />Checking administrator session…
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/20">
      <AdminSidebar selected={selected} user={user} signOut={signOut} />
      <div className="min-h-screen lg:pl-64">
        <AdminHeader
          selected={selected}
          selectedLabel={selectedItem.label}
          user={user}
          query={query}
          setQuery={setQuery}
          loading={loading}
          load={load}
          signOut={signOut}
        />
        <main className="mx-auto w-full max-w-[1680px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">TAKEIN control center</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {selected === 'overview' ? 'Platform overview' : selectedItem.label}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{sectionDescriptions[selected]}</p>
            </div>
            <Button variant="outline" className="self-start sm:self-auto" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              {loading ? 'Refreshing…' : 'Refresh data'}
            </Button>
          </div>

          {errors.length ? (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle />
              <AlertTitle>Some data could not be loaded</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {loading ? <DashboardSkeleton /> : sectionContent()}
        </main>
      </div>

      <ConfirmActionDialog
        action={pendingAction}
        busy={Boolean(busy)}
        onClose={() => setPendingAction(null)}
        onConfirm={applyPendingAction}
      />
    </div>
  );
}
