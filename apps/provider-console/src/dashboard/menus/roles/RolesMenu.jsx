'use client';

import { useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '../../../api';
import { SimpleTable, Status } from '../../components/common/DataDisplay';
import { branchAssignableItems, navGroups } from '../../config/navigation';
import { asArray, listFrom, statusLabel } from '../../lib/data';

const permissionGroups = navGroups.map((group) => ({
  ...group,
  items: branchAssignableItems.filter((item) => group.keys.includes(item.key)),
})).filter((group) => group.items.length);

const accessPresets = {
  'Front desk': ['dashboard', 'bookings', 'calendar', 'queue', 'walk_in', 'customers', 'chat', 'notifications'],
  Operations: ['dashboard', 'bookings', 'calendar', 'queue', 'walk_in', 'services', 'staffs', 'customers', 'reviews', 'chat', 'notifications'],
  Finance: ['dashboard', 'payments'],
};

function RoleDialog({ branches, onCreated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [branchID, setBranchID] = useState('');
  const [permissions, setPermissions] = useState(['dashboard', 'bookings']);
  const branchOptions = branches.map((item) => ({ value: String(item.id), label: item.branch_name || item.name }));

  async function submit(event) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setMessage('');
    try {
      await apiRequest('/api/provider/roles-permissions', { method: 'POST', body: {
        role_name: raw.role_name,
        branch_id: Number(branchID),
        description: raw.description,
        status: 'active',
        menu_keys: permissions,
        account_name: raw.account_name,
        account_email: raw.account_email,
        account_password: raw.account_password,
      } });
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
      <DialogTrigger render={<Button />}><Plus />Add location account</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Create location account</DialogTitle><DialogDescription>Create credentials and choose which provider menus this account can access.</DialogDescription></DialogHeader>
        <form id="create-role-form" className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="role-name">Role name</Label><Input id="role-name" name="role_name" required /></div><div className="grid gap-2"><Label>Location</Label><Select items={branchOptions} value={branchID || null} onValueChange={setBranchID}><SelectTrigger className="w-full"><SelectValue placeholder="Select a location" /></SelectTrigger><SelectContent>{branchOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="account-name">Account owner</Label><Input id="account-name" name="account_name" required /></div><div className="grid gap-2"><Label htmlFor="account-email">Login email</Label><Input id="account-email" name="account_email" type="email" required /></div></div>
          <div className="grid gap-2"><Label htmlFor="account-password">Initial password</Label><Input id="account-password" name="account_password" type="password" minLength="8" required /></div>
          <div className="grid gap-2"><Label htmlFor="role-description">Description</Label><Textarea id="role-description" name="description" /></div>
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2"><div><Label>Branch menu permissions</Label><p className="mt-1 text-xs text-muted-foreground">Head Office menus are never assignable to a branch account.</p></div><Badge variant="secondary">{permissions.length} selected</Badge></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(accessPresets).map(([label, values]) => <Button key={label} type="button" size="xs" variant="outline" onClick={() => setPermissions(values)}>{label}</Button>)}<Button type="button" size="xs" variant="ghost" onClick={() => setPermissions([])}>Clear</Button></div>
            <div className="mt-3 grid gap-4 rounded-xl border p-4 sm:grid-cols-2">{permissionGroups.map((group) => <section key={group.key}><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p><div className="grid gap-2">{group.items.map((item) => { const checked = permissions.includes(item.permission); const Icon = item.icon; return <label className="flex items-start gap-2 rounded-lg p-1.5 text-sm transition-colors hover:bg-muted/50" key={item.key}><Checkbox checked={checked} onCheckedChange={() => setPermissions((current) => checked ? current.filter((value) => value !== item.permission) : [...current, item.permission])} /><Icon className="mt-0.5 size-3.5 text-muted-foreground" /><span><span className="block text-xs font-medium">{item.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{item.description}</span></span></label>; })}</div></section>)}</div>
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
        </form>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button form="create-role-form" type="submit" disabled={busy || !branchID || !permissions.length}>{busy ? <LoaderCircle className="animate-spin" /> : null}{busy ? 'Saving...' : 'Create account'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RolesMenu({ data, reload }) {
  const roles = listFrom(data.roles);
  const branches = listFrom(data.branches);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><Badge variant="outline">HEAD OFFICE ONLY</Badge><p className="mt-1 text-xs text-muted-foreground">Create one branch-scoped login and select its visible menus.</p></div><RoleDialog branches={branches} onCreated={reload} /></div><SimpleTable title="Location accounts" description="Roles and menu permissions assigned to provider accounts." items={roles} emptyTitle="No location accounts yet" columns={[
    { label: 'Role', render: (item) => <div><strong className="block font-medium text-foreground">{item.role_name}</strong><small className="text-muted-foreground">{item.account_name}</small></div> }, { label: 'Email', key: 'account_email' }, { label: 'Branch', key: 'branch_id' },
    { label: 'Permissions', render: (item) => <div className="flex max-w-96 flex-wrap gap-1.5">{asArray(item.menu_keys || item.permissions).map((key) => <Badge variant="secondary" key={key}>{statusLabel(key)}</Badge>)}</div> }, { label: 'Status', render: (item) => <Status value={item.status} /> },
  ]} /></div>;
}
