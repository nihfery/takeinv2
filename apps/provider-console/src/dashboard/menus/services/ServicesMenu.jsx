'use client';

import { useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '../../../api';
import { SimpleTable, Status } from '../../components/common/DataDisplay';
import { listFrom, money } from '../../lib/data';

function CreateServiceDialog({ branches, onCreated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Salon', price: '', estimated_duration: 60, branch_id: '' });
  const [message, setMessage] = useState('');
  const branchOptions = branches.map((item) => ({ label: item.branch_name || item.name, value: String(item.id) }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await apiRequest('/api/provider/services', { method: 'POST', body: {
        title: form.title,
        category: form.category,
        price: Number(form.price),
        estimated_duration: Number(form.estimated_duration),
        minimum_duration: 0,
        maximum_duration: Number(form.estimated_duration),
        branch_ids: [Number(form.branch_id)],
        price_type: 'fixed',
        is_queue_enabled: true,
        is_scheduled_enabled: true,
        requires_dp: false,
        payment_policy: 'full_payment',
        status: 'active',
      } });
      await onCreated();
      setOpen(false);
      setForm({ title: '', category: 'Salon', price: '', estimated_duration: 60, branch_id: '' });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus />Add service</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create service</DialogTitle><DialogDescription>Add a fixed-price service to one business location.</DialogDescription></DialogHeader>
        <form id="create-service-form" className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2"><Label htmlFor="service-title">Service name</Label><Input id="service-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></div>
          <div className="grid gap-2"><Label htmlFor="service-category">Category</Label><Input id="service-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="service-price">Price in rupiah</Label><Input id="service-price" type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></div><div className="grid gap-2"><Label htmlFor="service-duration">Duration in minutes</Label><Input id="service-duration" type="number" min="1" value={form.estimated_duration} onChange={(event) => setForm({ ...form, estimated_duration: event.target.value })} required /></div></div>
          <div className="grid gap-2"><Label>Location</Label><Select items={branchOptions} value={form.branch_id || null} onValueChange={(value) => setForm({ ...form, branch_id: value })}><SelectTrigger className="w-full"><SelectValue placeholder="Select a location" /></SelectTrigger><SelectContent>{branchOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
        </form>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button form="create-service-form" type="submit" disabled={busy || !form.branch_id}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Saving…' : 'Create service'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesMenu({ data, reload }) {
  const items = listFrom(data.services);
  const branches = listFrom(data.branches);
  return <div className="space-y-4"><div className="flex justify-end"><CreateServiceDialog branches={branches} onCreated={reload} /></div><SimpleTable title="Service catalog" description="Services available across your business locations." items={items} emptyTitle="No services yet" columns={[
    { label: 'Service', render: (item) => <div><strong className="block font-medium text-foreground">{item.title}</strong><small className="text-muted-foreground">{item.category}</small></div> },
    { label: 'Price', render: (item) => money(item.price_minor_units || item.price_minor) },
    { label: 'Duration', render: (item) => `${item.estimated_duration || item.duration || 0} minutes` },
    { label: 'Status', render: (item) => <Status value={item.status} /> },
  ]} /></div>;
}
