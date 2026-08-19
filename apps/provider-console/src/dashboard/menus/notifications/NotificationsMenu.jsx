'use client';

import { useState } from 'react';
import { Bell, CheckCheck, LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '../../../api';
import { Empty } from '../../components/common/DataDisplay';
import { dateTime, listFrom } from '../../lib/data';

export default function NotificationsMenu({ data, reload }) {
  const items = listFrom(data.notifications);
  const unread = items.filter((item) => !item.read_at).length;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function mutate(key, path, method) {
    setBusy(key);
    setError('');
    try {
      await apiRequest(path, { method, body: {} });
      await reload();
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b py-5"><div><div className="flex items-center gap-2"><CardTitle>Notification center</CardTitle><Badge variant="secondary" className="rounded-full">{unread} unread</Badge></div><CardDescription className="mt-1">Operational updates from connected TAKEIN services.</CardDescription></div>{unread ? <Button size="sm" variant="outline" onClick={() => mutate('all', '/api/notifications/read-all', 'POST')} disabled={Boolean(busy)}>{busy === 'all' ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}Mark all read</Button> : null}</CardHeader>
      <CardContent className="px-0">
        {error ? <Alert variant="destructive" className="m-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {items.length ? <div className="divide-y">{items.map((item) => <button key={item.id} disabled={Boolean(item.read_at) || Boolean(busy)} onClick={() => mutate(String(item.id), `/api/notifications/${item.id}/read`, 'PATCH')} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/35 disabled:cursor-default disabled:opacity-65"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${item.read_at ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{busy === String(item.id) ? <LoaderCircle className="size-4 animate-spin" /> : <Bell className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm font-medium">{item.title}</strong><span className="text-xs text-muted-foreground">{dateTime(item.created_at)}</span></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p></div>{!item.read_at ? <span className="mt-2 size-2 rounded-full bg-primary" /> : null}</button>)}</div> : <Empty title="No notifications yet" />}
      </CardContent>
    </Card>
  );
}
