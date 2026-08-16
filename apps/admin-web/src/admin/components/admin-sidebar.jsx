'use client';

import Link from 'next/link';
import { LogOut, ServerCog } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { initials } from '../formatters';
import { navigationGroups, routeFor } from '../navigation';
import { TakeinBrand } from './brand';

export function SidebarContent({ selected, user, signOut, onNavigate, mobile = false }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center px-5">
        <TakeinBrand />
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-3 py-5">
        {navigationGroups.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45">
              {group.label}
            </p>
            <nav className="grid gap-1" aria-label={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = selected === item.key;
                return (
                  <Link
                    key={item.key}
                    href={routeFor(item.key)}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                    {item.key === 'audit' ? <Badge variant="outline" className="ml-auto h-5 border-sidebar-border px-1.5 text-[9px]">LIVE</Badge> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-xs text-sidebar-foreground/60">
          <ServerCog className="size-4 text-emerald-600" />
          <span>Go services connected</span>
          <span className="ml-auto size-2 rounded-full bg-emerald-500" />
        </div>
        <Separator className="mb-3" />
        <div className="flex items-center gap-3 rounded-lg px-2 py-1">
          <Avatar className="size-9">
            <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">
              {initials(user?.name || user?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name || 'Administrator'}</p>
            <p className="truncate text-xs text-sidebar-foreground/45">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar(props) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
