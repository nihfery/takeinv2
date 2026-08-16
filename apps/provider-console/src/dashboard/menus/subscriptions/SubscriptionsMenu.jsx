'use client';

import { useState } from 'react';
import { Check, CreditCard, LoaderCircle } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, dataOf } from '../../../api';
import { Empty } from '../../components/common/DataDisplay';
import { asArray, money } from '../../lib/data';

export default function SubscriptionsMenu({ data, reload }) {
  const value = dataOf(data.subscriptions, {});
  const plans = asArray(value.plans || value.available_plans || value);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function purchase() {
    if (!pendingPlan || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/provider/subscriptions/plans/${pendingPlan.id}/purchase`, { method: 'POST', body: {} });
      setPendingPlan(null);
      await reload();
    } catch (purchaseError) {
      setError(purchaseError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!plans.length) return <Card className="shadow-none"><Empty title="No plans available" /></Card>;
  return <div className="space-y-4">{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan, index) => <Card className="relative shadow-none" key={plan.id}>{index === 1 ? <Badge className="absolute right-4 top-4">Recommended</Badge> : null}<CardHeader><span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-5" /></span><CardTitle>{plan.name}</CardTitle><CardDescription>{plan.duration_days || 30} days of provider access</CardDescription></CardHeader><CardContent><div className="text-3xl font-semibold tracking-tight">{money(plan.price_minor_units || plan.price_minor)}</div><div className="mt-5 space-y-2 text-sm text-muted-foreground"><p className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Up to {plan.branch_limit || plan.max_branches || 1} locations</p><p className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />Provider operations workspace</p><p className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />TAKEIN service connectivity</p></div></CardContent><CardFooter><Button className="w-full" variant={index === 1 ? 'default' : 'outline'} onClick={() => setPendingPlan(plan)}>Choose plan</Button></CardFooter></Card>)}</section>
    <AlertDialog open={Boolean(pendingPlan)} onOpenChange={(open) => { if (!open && !busy) setPendingPlan(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogMedia className="bg-primary/10 text-primary"><CreditCard /></AlertDialogMedia><AlertDialogTitle>Purchase {pendingPlan?.name}?</AlertDialogTitle><AlertDialogDescription>This starts the subscription purchase flow for {money(pendingPlan?.price_minor_units || pendingPlan?.price_minor)}.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction onClick={purchase} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Processing…' : 'Confirm purchase'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
