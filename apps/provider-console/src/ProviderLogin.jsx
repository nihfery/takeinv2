'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Brand from './dashboard/components/Brand';
import { currentProvider, loginProvider, logoutProvider } from './api';

function safeNextPath() {
  if (typeof window === 'undefined') return '/provider/dashboard';
  const value = new URLSearchParams(window.location.search).get('next') || '/provider/dashboard';
  return value.startsWith('/provider/') && !value.startsWith('//') ? value : '/provider/dashboard';
}

function DashboardPreview() {
  const bars = [42, 68, 52, 84, 63, 91, 72];
  return (
    <div className="relative mx-auto w-full max-w-2xl rounded-2xl border border-white/15 bg-white p-3 text-neutral-950 shadow-2xl shadow-black/30 sm:p-4">
      <div className="flex items-center gap-2 border-b pb-3"><span className="grid size-7 place-items-center rounded-md bg-neutral-950 text-white"><BarChart3 className="size-3.5" /></span><span className="text-xs font-semibold">Provider Overview</span><span className="ml-auto size-6 rounded-full bg-neutral-200" /></div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[['Bookings', '128'], ['Revenue', 'Rp 42.8m'], ['Customers', '346']].map(([label, value]) => <div key={label} className="rounded-lg border p-2.5"><p className="text-[8px] text-neutral-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="text-[9px] font-medium">Booking performance</p><Badge variant="secondary" className="text-[7px]">30 days</Badge></div><div className="mt-5 flex h-24 items-end gap-2">{bars.map((height, index) => <span key={index} className="flex-1 rounded-t-sm bg-neutral-900" style={{ height: `${height}%`, opacity: 0.35 + (index * 0.08) }} />)}</div></div>
        <div className="rounded-lg border p-3"><p className="text-[9px] font-medium">Today</p><div className="mt-3 grid gap-2">{[CalendarDays, UsersRound, ShieldCheck].map((Icon, index) => <div key={index} className="flex items-center gap-2 rounded-md bg-neutral-100 p-2"><Icon className="size-3" /><span className="h-1.5 flex-1 rounded bg-neutral-300" /></div>)}</div></div>
      </div>
    </div>
  );
}

export default function ProviderLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const landingURL = process.env.NEXT_PUBLIC_PROVIDER_LANDING_URL || 'http://127.0.0.1:5173';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get('email') || '');
    setRegistered(params.get('registered') === '1');
    setError(params.get('login_error') || '');
    currentProvider().then((payload) => {
      if (payload?.user?.role === 'provider') router.replace(safeNextPath());
    }).catch(() => {});
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await loginProvider(email.trim(), password);
      if (payload?.user?.role !== 'provider') {
        await logoutProvider().catch(() => {});
        throw new Error('This account does not have provider access.');
      }
      sessionStorage.setItem('takein_provider_user', JSON.stringify(payload.user));
      router.replace(safeNextPath());
      router.refresh();
    } catch (loginError) {
      setError(loginError.message || 'Provider sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <Brand />
        <div className="flex flex-1 items-center justify-center py-10">
          <Card className="w-full max-w-md border-0 bg-transparent shadow-none ring-0">
            <CardHeader className="px-0">
              <Badge variant="secondary" className="mb-2 w-fit">Provider account</Badge>
              <CardTitle className="text-3xl font-semibold tracking-tight">Welcome back</CardTitle>
              <CardDescription>Use the provider credentials registered with TAKEIN.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form className="grid gap-4" onSubmit={submit}>
                {registered ? <Alert><CheckCircle2 /><AlertTitle>Registration complete</AlertTitle><AlertDescription>Sign in to continue business verification.</AlertDescription></Alert> : null}
                <div className="grid gap-1.5"><Label htmlFor="provider-email">Email address</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="provider-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="provider@takein.id" className="h-9 pl-9" required /></div></div>
                <div className="grid gap-1.5"><Label htmlFor="provider-password">Password</Label><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="provider-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" className="h-9 px-9" required /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>
                {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Unable to sign in</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
                <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Signing in...' : 'Sign in'}{!busy ? <ArrowRight data-icon="inline-end" /> : null}</Button>
              </form>
              <p className="mt-6 text-center text-xs text-muted-foreground">New provider? <Link href={`${landingURL}/register`} className="font-medium text-foreground underline-offset-4 hover:underline">Register your business</Link></p>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 TAKEIN. Connected to Go microservices.</p>
      </section>

      <section className="provider-auth-preview relative hidden min-h-screen overflow-hidden bg-neutral-950 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div><Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">TAKEIN Provider Console</Badge><h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] xl:text-5xl">Run every location from one operational workspace.</h1><p className="mt-4 max-w-lg text-sm leading-6 text-white/60">Bookings, teams, services, customers, and payments stay connected to the dedicated Go services.</p></div>
        <DashboardPreview />
        <div className="flex items-center gap-2 text-xs text-white/55"><span className="size-1.5 rounded-full bg-emerald-400" />Provider platform operational</div>
      </section>
    </main>
  );
}
