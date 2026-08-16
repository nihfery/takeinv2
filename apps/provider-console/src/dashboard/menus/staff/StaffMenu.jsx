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
import { listFrom } from '../../lib/data';

function Field({ label, name, ...props }) {
  return <div className="grid gap-2"><Label htmlFor={`staff-${name}`}>{label}</Label><Input id={`staff-${name}`} name={name} {...props} /></div>;
}

function SelectField({ label, value, onValueChange, placeholder, options }) {
  return <div className="grid gap-2"><Label>{label}</Label><Select items={options} value={value || null} onValueChange={onValueChange}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem value={item.value} key={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>;
}

function StaffDialog({ branches, categories, onCreated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [branchID, setBranchID] = useState('');
  const [categoryID, setCategoryID] = useState('');
  const [gender, setGender] = useState('');
  const branchOptions = branches.map((item) => ({ value: String(item.id), label: item.branch_name || item.name }));
  const categoryOptions = categories.map((item) => ({ value: String(item.id), label: item.name || item.title }));
  const genderOptions = [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }];

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set('branch_id', branchID);
    form.set('category_id', categoryID);
    if (gender) form.set('gender', gender);
    form.set('status', 'active');
    setBusy(true);
    setMessage('');
    try {
      await apiRequest('/api/provider/staff', { method: 'POST', body: form });
      formElement.reset();
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
      <DialogTrigger render={<Button />}><Plus />Add professional</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add team member</DialogTitle><DialogDescription>Create a professional assigned to a location and service category.</DialogDescription></DialogHeader>
        <form id="create-staff-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field label="First name" name="first_name" required /><Field label="Last name" name="last_name" required />
          <Field label="Email" name="email" type="email" required /><Field label="Username" name="username" />
          <SelectField label="Location" value={branchID} onValueChange={setBranchID} placeholder="Select a location" options={branchOptions} />
          <SelectField label="Category" value={categoryID} onValueChange={setCategoryID} placeholder="Select a category" options={categoryOptions} />
          <SelectField label="Gender" value={gender} onValueChange={setGender} placeholder="Optional" options={genderOptions} />
          <Field label="Country code" name="country_code" defaultValue="+62" />
          <Field label="Phone number" name="phone_number" /><Field label="Role" name="role" defaultValue="professional" />
          <div className="sm:col-span-2"><Field label="Profile image" name="image" type="file" accept="image/png,image/jpeg,image/webp" /></div>
          {message ? <p className="text-sm text-destructive sm:col-span-2">{message}</p> : null}
        </form>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button form="create-staff-form" type="submit" disabled={busy || !branchID || !categoryID}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Saving…' : 'Add professional'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffMenu({ data, reload }) {
  return <div className="space-y-4"><div className="flex justify-end"><StaffDialog branches={listFrom(data.branches)} categories={listFrom(data.categories)} onCreated={reload} /></div><SimpleTable title="Professional team" description="Team members available across provider locations." items={listFrom(data.staff)} emptyTitle="No team members yet" columns={[
    { label: 'Professional', render: (item) => <div><strong className="block font-medium text-foreground">{item.first_name} {item.last_name}</strong><small className="text-muted-foreground">{item.email}</small></div> },
    { label: 'Role', key: 'role' }, { label: 'Branch', key: 'branch_id' }, { label: 'Status', render: (item) => <Status value={item.status} /> },
  ]} /></div>;
}
