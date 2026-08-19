'use client';

import {
  Building2,
  CheckCircle2,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  Mail,
  PlusCircle,
  ServerCog,
  Store,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { accountScope, navigationForGroup, navGroups } from '../config/navigation';
import Brand from './Brand';
import ProviderNavLink from './ProviderNavLink';

function initials(value) {
  return String(value || 'P').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function SidebarAction({ compact, item, label, icon: Icon, onNavigate, variant = 'default' }) {
  if (!item) return null;
  return (
    <Tooltip>
      <TooltipTrigger render={(
        <ProviderNavLink
          section={item.key}
          onClick={onNavigate}
          className={cn(
            'inline-flex h-8 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors',
            variant === 'default' ? 'bg-primary text-primary-foreground hover:bg-primary/85' : 'border bg-background hover:bg-muted',
            compact && 'size-8 px-0',
          )}
        />
      )}>
        <Icon className="size-4" />
        {!compact ? <span>{label}</span> : null}
      </TooltipTrigger>
      {compact ? <TooltipContent side="right">{label}</TooltipContent> : null}
    </Tooltip>
  );
}

function UserMenu({ compact, user, scope, signOut }) {
  const ScopeIcon = scope.type === 'branch' ? Store : Building2;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={(
        <Button
          variant="ghost"
          className={cn('h-auto w-full justify-start gap-2 rounded-lg p-1.5 text-left', compact && 'size-9 justify-center p-0')}
          aria-label="Open provider account menu"
        />
      )}>
        <Avatar className="size-7 rounded-md">
          <AvatarFallback className="rounded-md bg-primary text-[9px] text-primary-foreground">{initials(user?.name || user?.email)}</AvatarFallback>
        </Avatar>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{user?.name || 'Provider'}</span>
              <span className="block truncate text-[10px] font-normal text-muted-foreground">{user?.email}</span>
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? 'right' : 'top'} align="end" className="w-64">
        <DropdownMenuLabel className="p-2 font-normal">
          <span className="flex items-center gap-2.5">
            <Avatar className="size-9 rounded-lg"><AvatarFallback className="rounded-lg bg-primary text-xs text-primary-foreground">{initials(user?.name || user?.email)}</AvatarFallback></Avatar>
            <span className="min-w-0"><strong className="block truncate text-sm">{user?.name || 'Provider'}</strong><span className="block truncate text-xs text-muted-foreground">{user?.email}</span></span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled><ScopeIcon />{scope.label}<Badge variant="secondary" className="ml-auto text-[9px]">{scope.type.toUpperCase()}</Badge></DropdownMenuItem>
        <DropdownMenuItem disabled><CheckCircle2 className="text-emerald-600" />Go services connected</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarContent({ selected, user, signOut, visibleItems, mobile = false, collapsed = false, onNavigate }) {
  const compact = collapsed && !mobile;
  const scope = accountScope(user);
  const WorkspaceIcon = scope.type === 'branch' ? Store : Building2;
  const availableGroups = navGroups
    .map((group) => ({ ...group, items: navigationForGroup(visibleItems, group) }))
    .filter((group) => group.items.length);
  const quickBooking = visibleItems.find((item) => item.key === 'walk-in') || visibleItems.find((item) => item.key === 'bookings');
  const inbox = visibleItems.find((item) => item.key === 'chat');

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-12 shrink-0 items-center border-b px-3', compact && 'justify-center px-2')}>
        <Brand compact={compact} />
      </div>

      <div className={cn('shrink-0 border-b p-2.5', compact && 'px-2')}>
        <DropdownMenu>
          <DropdownMenuTrigger render={(
            <Button variant="ghost" className={cn('h-10 w-full justify-start gap-2 px-2', compact && 'justify-center px-0')} aria-label="Provider workspace" />
          )}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-background"><WorkspaceIcon className="size-3.5" /></span>
            {!compact ? <><span className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{user?.business_name || user?.provider_name || 'TAKEIN Studio'}</span><span className="block truncate text-[10px] text-muted-foreground">{scope.label}</span></span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></> : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={compact ? 'right' : 'bottom'} align="start" className="w-64">
            <DropdownMenuLabel>Current workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled><WorkspaceIcon />{scope.label}<Badge variant="secondary" className="ml-auto text-[9px]">{scope.type.toUpperCase()}</Badge></DropdownMenuItem>
            <DropdownMenuItem disabled><ServerCog />Go microservices</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={cn('grid shrink-0 gap-1 border-b p-2.5', !compact && 'grid-cols-[1fr_auto]', compact && 'px-2')}>
        <SidebarAction compact={compact} item={quickBooking} label="Quick booking" icon={PlusCircle} onNavigate={onNavigate} />
        <SidebarAction compact={compact} item={inbox} label="Inbox" icon={Mail} onNavigate={onNavigate} variant="outline" />
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto px-2 py-3', compact && 'px-2')}>
        <nav className="grid gap-3" aria-label="Provider navigation">
          {availableGroups.map((group) => (
            <section key={group.key} aria-label={`${group.label} menu`}>
              {!compact ? <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group.label}</p> : <Separator className="my-1" />}
              <div className="grid gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = selected === item.key;
                  return (
                    <Tooltip key={item.key}>
                      <TooltipTrigger render={(
                        <ProviderNavLink
                          section={item.key}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors',
                            compact && 'mx-auto size-8 justify-center px-0',
                            active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )}
                        />
                      )}>
                        <Icon className="size-4 shrink-0" />
                        {!compact ? <span className="truncate">{item.label}</span> : null}
                        {!compact && item.key === 'queue' ? <span className="ml-auto size-1.5 rounded-full bg-emerald-500" /> : null}
                      </TooltipTrigger>
                      {compact ? <TooltipContent side="right">{item.label}</TooltipContent> : null}
                    </Tooltip>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </div>

      <div className={cn('shrink-0 border-t p-2.5', compact && 'px-2')}>
        {!compact ? (
          <div className="mb-2 rounded-lg border bg-card p-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><ServerCog className="size-4" /></span>
              <div className="min-w-0"><p className="text-xs font-medium">Provider services</p><p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">Identity, booking, catalog, and payment services are connected.</p></div>
            </div>
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />Operational</div>
          </div>
        ) : null}
        {!compact ? <Button variant="ghost" className="mb-1 h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground"><CircleHelp className="size-4" />Help & support</Button> : null}
        <UserMenu compact={compact} user={user} scope={scope} signOut={signOut} />
      </div>
      {mobile ? <div className="h-2" /> : null}
    </div>
  );
}

export default function Sidebar({ collapsed = false, ...props }) {
  return (
    <aside className={cn('fixed inset-y-0 left-0 z-50 hidden border-r bg-sidebar transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-68')}>
      <SidebarContent {...props} collapsed={collapsed} />
    </aside>
  );
}
