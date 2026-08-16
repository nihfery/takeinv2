'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TakeinBrand } from './admin/components/brand';
import { currentAdmin, loginAdmin, logoutAdmin } from './api';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentAdmin()
      .then((payload) => {
        if (payload?.user?.role === 'admin') router.replace('/admin/dashboard');
      })
      .catch(() => {});
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await loginAdmin(email.trim(), password);
      if (payload?.user?.role !== 'admin') {
        await logoutAdmin().catch(() => {});
        throw new Error('This account does not have administrator access.');
      }
      router.replace('/admin/dashboard');
      router.refresh();
    } catch (loginError) {
      setError(loginError.message || 'Administrator sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(480px,.95fr)]">
      <section className="takein-login-visual relative hidden min-h-screen overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <TakeinBrand inverted />
        <div className="relative z-10 max-w-2xl">
          <Badge className="mb-6 border-white/15 bg-white/10 text-white hover:bg-white/10">Platform administration</Badge>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-[-0.045em] xl:text-6xl">
            One workspace for the entire marketplace.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/65">
            Provider verification, customer operations, bookings, catalog, promotions, and audit events—connected directly to TAKEIN Go microservices.
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
            {['Secure access', 'Live service data', 'Audited actions'].map((label) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-xs text-white/75 backdrop-blur-sm">
                <ShieldCheck className="mb-3 size-4 text-emerald-300" />{label}
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/35">TAKEIN Control Center · Go microservices</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-md">
          <TakeinBrand className="mb-10 lg:hidden" />
          <Card className="border-0 bg-transparent px-0 shadow-none">
            <CardHeader className="px-0">
              <Badge variant="secondary" className="mb-3 w-fit rounded-full">Administrator access</Badge>
              <CardTitle className="text-3xl tracking-tight sm:text-4xl">Welcome back</CardTitle>
              <CardDescription className="text-sm leading-6">
                Sign in with an administrator account from the identity service.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form className="space-y-5" onSubmit={submit}>
                <div className="grid gap-2">
                  <Label htmlFor="admin-email">Email address</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="admin-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                      placeholder="admin@takein.id"
                      className="h-10 pl-9"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="h-10 px-9"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Unable to sign in</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : null}
                  {busy ? 'Signing in…' : 'Sign in to dashboard'}
                  {!busy ? <ArrowRight data-icon="inline-end" /> : null}
                </Button>
              </form>
              <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
                Session credentials are stored only in secure HttpOnly cookies.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
