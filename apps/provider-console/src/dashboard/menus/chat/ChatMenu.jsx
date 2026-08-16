'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, MessageCircle, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { apiRequest } from '../../../api';
import { Empty } from '../../components/common/DataDisplay';
import { dateTime, listFrom, statusLabel } from '../../lib/data';

export default function ChatMenu({ data }) {
  const threads = listFrom(data.chat);
  const [activeID, setActiveID] = useState(threads[0]?.id || null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadMessages = useCallback(async (threadID) => {
    if (!threadID) { setMessages([]); return; }
    try {
      const payload = await apiRequest(`/api/chat/threads/${threadID}/messages`);
      setMessages(listFrom(payload));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => { if (!activeID && threads[0]?.id) setActiveID(threads[0].id); }, [activeID, threads]);
  useEffect(() => { loadMessages(activeID); }, [activeID, loadMessages]);

  async function send(event) {
    event.preventDefault();
    if (!activeID || !body.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/chat/threads/${activeID}/messages`, { method: 'POST', body: { body: body.trim() } });
      setBody('');
      await loadMessages(activeID);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!threads.length) return <Card className="shadow-none"><Empty title="No conversations yet" description="Customer conversations will appear after a booking thread is created." /></Card>;
  const activeThread = threads.find((item) => String(item.id) === String(activeID));

  return (
    <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card shadow-none lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b lg:border-b-0 lg:border-r">
        <div className="border-b p-4"><h2 className="font-semibold">Conversations</h2><p className="mt-1 text-xs text-muted-foreground">{threads.length} active threads</p></div>
        <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[550px]">{threads.map((thread) => {
          const active = String(activeID) === String(thread.id);
          return <button className={cn('flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors', active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} key={thread.id} onClick={() => setActiveID(thread.id)}><Avatar className="size-8"><AvatarFallback className={active ? 'bg-primary-foreground/15 text-primary-foreground' : ''}>#{thread.id}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium">{thread.ticket_subject || `Conversation #${thread.id}`}</p><p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/65' : 'text-muted-foreground')}>{statusLabel(thread.conversation_type)} · {dateTime(thread.last_message_at || thread.created_at)}</p></div></button>;
        })}</div>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b p-4"><span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><MessageCircle className="size-4" /></span><div><h2 className="font-semibold">{activeThread?.ticket_subject || `Conversation #${activeID}`}</h2><Badge variant="secondary" className="mt-1">{statusLabel(activeThread?.conversation_type || 'booking chat')}</Badge></div></header>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 sm:p-6">
          {messages.length ? messages.map((item) => {
            const provider = ['provider', 'staff', 'admin'].includes(String(item.sender_role).toLowerCase());
            return <div className={cn('flex', provider ? 'justify-end' : 'justify-start')} key={item.id}><div className={cn('max-w-[82%] rounded-2xl px-4 py-3', provider ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-card')}><p className="text-sm leading-6">{item.body}</p><p className={cn('mt-1.5 text-[10px]', provider ? 'text-primary-foreground/60' : 'text-muted-foreground')}>{statusLabel(item.sender_role)} · {dateTime(item.created_at)}</p></div></div>;
          }) : <Empty title="No messages yet" />}
        </div>
        <form className="border-t bg-card p-4" onSubmit={send}>
          {error ? <Alert variant="destructive" className="mb-3"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <div className="flex items-end gap-2"><Textarea value={body} maxLength={5000} rows={2} onChange={(event) => setBody(event.target.value)} placeholder="Write a reply to the customer…" required /><Button type="submit" size="icon" className="size-10" disabled={busy || !body.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}<span className="sr-only">Send message</span></Button></div>
        </form>
      </section>
    </div>
  );
}
