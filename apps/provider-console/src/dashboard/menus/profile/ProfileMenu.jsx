'use client';

import { useState } from 'react';
import { Building2, CheckCircle2, FileCheck2, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '../../../api';
import { Status } from '../../components/common/DataDisplay';

function VerificationForm({ profile, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('/api/provider/profile/documents', { method: 'POST', body: new FormData(event.currentTarget) });
      setMessage({ type: 'success', text: 'Documents submitted for verification.' });
      await onCreated();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (profile?.document_status === 'verified') return <Card className="border-emerald-200 bg-emerald-50/50 shadow-none"><CardContent className="flex items-start gap-4 py-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 /></span><div><h2 className="font-semibold text-emerald-950">Verified business</h2><p className="mt-1 text-sm leading-6 text-emerald-800/70">Your documents have been approved and all operational features are ready to use.</p></div></CardContent></Card>;

  return (
    <Card className="shadow-none">
      <CardHeader><span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FileCheck2 className="size-5" /></span><CardTitle>Business verification</CardTitle><CardDescription>Original documents are uploaded privately through the Go Media Service.</CardDescription></CardHeader>
      <CardContent><form className="grid gap-5" onSubmit={submit}>
        <div className="grid gap-2"><Label htmlFor="nib-number">NIB number</Label><Input id="nib-number" name="nib_number" minLength="13" maxLength="13" pattern="[0-9]{13}" required defaultValue={profile?.nib_number || ''} /></div>
        <div className="grid gap-2"><Label htmlFor="ktp-image">ID card photo</Label><Input id="ktp-image" name="ktp_image" type="file" accept="image/png,image/jpeg,image/webp" required={!profile?.ktp_object_id} /></div>
        <div className="grid gap-2"><Label htmlFor="nib-document">NIB document</Label><Input id="nib-document" name="nib_document" type="file" accept="application/pdf,image/png,image/jpeg" required={!profile?.nib_object_id} /></div>
        <div className="grid gap-2"><Label htmlFor="business-image">Business photo</Label><Input id="business-image" name="business_image" type="file" accept="image/png,image/jpeg,image/webp" required={!profile?.business_object_id} /></div>
        {message ? <Alert variant={message.type === 'error' ? 'destructive' : 'default'}><AlertTitle>{message.type === 'error' ? 'Submission failed' : 'Documents submitted'}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
        <Button size="lg" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Submitting…' : 'Submit verification'}</Button>
      </form></CardContent>
    </Card>
  );
}

export default function ProfileMenu({ data, user, reload }) {
  const value = data.profile || {};
  const profile = value.data || {};
  const displayName = value.identity?.name || user.name || 'Provider';
  return <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><Card className="h-fit shadow-none"><CardHeader className="items-center text-center"><Avatar className="size-20"><AvatarFallback className="bg-primary text-2xl text-primary-foreground">{String(displayName).slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><CardTitle className="mt-3">{displayName}</CardTitle><CardDescription>{value.identity?.email || user.email}</CardDescription><Status value={profile.document_status || 'pending'} /></CardHeader><CardContent><Separator className="mb-5" /><dl className="grid gap-4 text-sm">{[['Provider ID', profile.id || user.provider_id], ['Phone', profile.phone_number || '—'], ['Account status', profile.status || '—']].map(([label, detail]) => <div className="flex items-center justify-between gap-4" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="m-0 text-right font-medium">{detail}</dd></div>)}</dl><div className="mt-6 flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><Building2 className="size-4" />Provider identity from Go services</div></CardContent></Card>{!user.branch_id ? <VerificationForm profile={profile} onCreated={reload} /> : null}</div>;
}
