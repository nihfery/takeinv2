'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle, UserRoundPlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '../../../api';
import { listFrom, today } from '../../lib/data';

function SelectField({ label, value, onValueChange, placeholder, items }) {
  const options = items.map((item) => ({ label: item.label, value: String(item.value) }));
  return (
    <div className="grid gap-2"><Label>{label}</Label><Select items={options} value={value || null} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
  );
}

export default function WalkInMenu({ data, onCreated }) {
  const branches = listFrom(data.branches);
  const services = listFrom(data.services);
  const staff = listFrom(data.staff);
  const [form, setForm] = useState({ customer_name: '', customer_phone: '', branch_id: '', service_id: '', staff_id: '', booking_date: today(), start_time: '09:00', notes: '', payment_type: 'pay_at_salon' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('/api/provider/bookings/walk-in', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: {
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        branch_id: Number(form.branch_id),
        service_ids: [Number(form.service_id)],
        staff_id: Number(form.staff_id),
        booking_date: form.booking_date,
        start_time: form.start_time,
        notes: form.notes,
        payment_type: form.payment_type,
      } });
      setMessage({ type: 'success', text: 'Walk-in booking created successfully.' });
      onCreated();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const branchStaff = staff.filter((item) => !form.branch_id || String(item.branch_id) === String(form.branch_id));
  return (
    <Card className="mx-auto max-w-4xl shadow-none">
      <CardHeader><span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UserRoundPlus className="size-5" /></span><CardTitle>Add a walk-in</CardTitle><CardDescription>Booking Service checks availability before creating the offline appointment.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="walkin-name">Customer name</Label><Input id="walkin-name" value={form.customer_name} onChange={(event) => update('customer_name', event.target.value)} required /></div>
            <div className="grid gap-2"><Label htmlFor="walkin-phone">Phone number</Label><Input id="walkin-phone" value={form.customer_phone} onChange={(event) => update('customer_phone', event.target.value)} required /></div>
            <SelectField label="Location" value={form.branch_id} onValueChange={(value) => update('branch_id', value)} placeholder="Select a location" items={branches.map((item) => ({ value: item.id, label: item.branch_name || item.name }))} />
            <SelectField label="Service" value={form.service_id} onValueChange={(value) => update('service_id', value)} placeholder="Select a service" items={services.map((item) => ({ value: item.id, label: item.title || item.name }))} />
            <SelectField label="Professional" value={form.staff_id} onValueChange={(value) => update('staff_id', value)} placeholder="Select a team member" items={branchStaff.map((item) => ({ value: item.id, label: `${item.first_name || ''} ${item.last_name || ''}`.trim() }))} />
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="walkin-date">Date</Label><Input id="walkin-date" type="date" value={form.booking_date} onChange={(event) => update('booking_date', event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="walkin-time">Time</Label><Input id="walkin-time" type="time" value={form.start_time} onChange={(event) => update('start_time', event.target.value)} required /></div></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="walkin-notes">Notes</Label><Textarea id="walkin-notes" value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Optional booking notes" /></div>
          {message ? <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>{message.type === 'error' ? <AlertCircle /> : <CheckCircle2 />}<AlertTitle>{message.type === 'error' ? 'Unable to create booking' : 'Booking created'}</AlertTitle><AlertDescription>{message.text}</AlertDescription></Alert> : null}
          <Button size="lg" className="w-full sm:w-fit" disabled={busy || !form.branch_id || !form.service_id || !form.staff_id}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Saving…' : 'Create booking'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
