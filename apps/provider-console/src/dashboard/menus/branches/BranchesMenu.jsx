'use client';

import { useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '../../../api';
import { SimpleTable, Status } from '../../components/common/DataDisplay';
import { listFrom } from '../../lib/data';

function Field({ label, name, ...props }) {
  return <div className="grid gap-2"><Label htmlFor={`branch-${name}`}>{label}</Label><Input id={`branch-${name}`} name={name} {...props} /></div>;
}

function BranchDialog({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day) => form.append('working_days', day));
    setBusy(true);
    setMessage('');
    try {
      await apiRequest('/api/provider/branches', { method: 'POST', body: form });
      await onCreated();
      setOpen(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus />Add location</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Create business location</DialogTitle><DialogDescription>Add contact information, address, hours, and a location image.</DialogDescription></DialogHeader>
        <form id="create-branch-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Location name" name="branch_name" required />
          <Field label="Location email" name="email" type="email" required />
          <Field label="Phone code" name="phone_code" defaultValue="+62" required />
          <Field label="Phone number" name="phone_number" required />
          <div className="sm:col-span-2"><Field label="Full address" name="address" required /></div>
          <Field label="City" name="city_id" required />
          <Field label="Province" name="state_id" required />
          <Field label="Country" name="country_id" defaultValue="ID" required />
          <Field label="Postal code" name="zip_code" required />
          <Field label="Opening time" name="working_start_hour" type="time" defaultValue="09:00" required />
          <Field label="Closing time" name="working_end_hour" type="time" defaultValue="18:00" required />
          <div className="sm:col-span-2"><Field label="Location image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required /></div>
          <input type="hidden" name="status" value="active" />
          {message ? <p className="text-sm text-destructive sm:col-span-2">{message}</p> : null}
        </form>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button form="create-branch-form" type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Saving…' : 'Create location'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BranchesMenu({ data, user, reload }) {
  const items = listFrom(data.branches);
  return <div className="space-y-4">{!user.branch_id ? <div className="flex justify-end"><BranchDialog onCreated={reload} /></div> : null}<SimpleTable title="Business locations" description="Contact details and operating hours for each branch." items={items} emptyTitle="No locations yet" columns={[
    { label: 'Location', render: (item) => <div><strong className="block font-medium text-foreground">{item.branch_name || item.name}</strong><small className="max-w-64 truncate text-muted-foreground">{item.address}</small></div> },
    { label: 'Contact', render: (item) => <div><strong className="block font-medium text-foreground">{item.email}</strong><small className="text-muted-foreground">{item.phone_number}</small></div> },
    { label: 'Hours', render: (item) => `${item.working_start_hour || '—'}–${item.working_end_hour || '—'}` },
    { label: 'Status', render: (item) => <Status value={item.status} /> },
  ]} /></div>;
}
