'use client';

import {
  Building2,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  Settings2,
  Sparkles,
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
import { accountScope, navigationForGroup, navGroups, navItems } from '../config/navigation';
import ProviderNavLink from './ProviderNavLink';

function initials(value) {
  return String(value || 'P').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function firstVisible(group, visibleItems) {
  return group.keys.find((key) => visibleItems.some((item) => item.key === key));
}

function GroupRail({ activeGroup, visibleItems }) {
  const profileVisible = visibleItems.some((item) => item.key === 'profile');
  return (
    <div className="flex w-14 shrink-0 flex-col items-center border-r bg-muted/25 py-3">
      <ProviderNavLink section="overview" className="mb-5 grid size-8 place-items-center rounded-lg bg-foreground text-xs font-black text-background shadow-sm" aria-label="TAKEIN Provider home">
        T
      </ProviderNavLink>
      <nav className="grid gap-2" aria-label="Provider workspace groups">
        {navGroups.filter((group) => firstVisible(group, visibleItems)).map((group) => {
          const target = firstVisible(group, visibleItems);
          const Icon = navItems.find((item) => item.key === target)?.icon || Sparkles;
          const active = activeGroup.key === group.key;
          return (
            <Tooltip key={group.key}>
              <TooltipTrigger render={<Button variant={active ? 'default' : 'ghost'} size="icon-sm" render={<ProviderNavLink section={target} aria-label={group.label} />} />}>
                <Icon />
              </TooltipTrigger>
              <TooltipContent side="right">{group.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <div className="mt-auto grid gap-2">
        {profileVisible ? <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" render={<ProviderNavLink section="profile" aria-label="Settings" />} />}><Settings2 /></TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip> : null}
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Help" />}><CircleHelp /></TooltipTrigger>
          <TooltipContent side="right">Provider help</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function SidebarContent({ selected, user, signOut, activeGroup, visibleItems, mobile = false, onNavigate }) {
  const businessName = user?.business_name || user?.provider_name || user?.name || 'TAKEIN Studio';
  const scope = accountScope(user);
  const WorkspaceIcon = scope.type === 'branch' ? Store : Building2;
  const currentGroup = activeGroup || navGroups[0];
  const groupItems = navigationForGroup(visibleItems, currentGroup);
  const availableGroups = navGroups.filter((group) => firstVisible(group, visibleItems));

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b px-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2" aria-label="Switch provider workspace" />}>
            <span className="grid size-6 shrink-0 place-items-center rounded-md border bg-background"><WorkspaceIcon className="size-3.5" /></span>
            <span className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{businessName}</span><span className="block truncate text-[9px] text-muted-foreground">{scope.label}</span></span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel><span className="block">Provider workspace</span><span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{scope.description}</span></DropdownMenuLabel>
            <DropdownMenuItem><WorkspaceIcon />{scope.label}<Badge variant={scope.type === 'central' ? 'default' : 'secondary'} className="ml-auto text-[8px]">{scope.type === 'central' ? 'CENTRAL' : 'BRANCH'}</Badge></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><Sparkles />Go services connected</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {mobile ? <div className="mb-4 flex flex-wrap gap-1.5 border-b pb-4">{availableGroups.map((group) => {
          const target = firstVisible(group, visibleItems);
          return <Button key={group.key} size="xs" variant={currentGroup.key === group.key ? 'default' : 'outline'} render={<ProviderNavLink section={target} onClick={onNavigate} />}>{group.label}</Button>;
        })}</div> : null}

        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{currentGroup.label}</p>
            <Badge variant="secondary" className="h-4 rounded px-1.5 text-[8px]">{groupItems.length}</Badge>
          </div>
          <nav className="grid gap-0.5" aria-label={`${currentGroup.label} menu`}>
            {groupItems.map((item) => {
              const Icon = item.icon;
              const active = selected === item.key;
              return (
                <ProviderNavLink
                  key={item.key}
                  section={item.key}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex h-8 items-center gap-2.5 rounded-md px-2 text-xs font-medium transition-colors',
                    active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{item.label}</span>
                  {item.key === 'queue' ? <Badge variant="outline" className="ml-auto h-4 rounded px-1 text-[8px]">LIVE</Badge> : null}
                </ProviderNavLink>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="mb-3 flex items-center gap-2 rounded-md bg-muted/45 px-2.5 py-2 text-[10px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>{scope.type === 'central' ? 'All branches · Go services online' : `${scope.label} · ${visibleItems.length} menus`}</span>
        </div>
        <Separator className="mb-3" />
        <div className="flex items-center gap-2">
          <Avatar className="size-7"><AvatarFallback className="bg-foreground text-[9px] text-background">{initials(user?.name || user?.email)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user?.name || 'Provider'}</p><p className="truncate text-[10px] text-muted-foreground">{user?.email}</p></div>
          <Button variant="ghost" size="icon-xs" onClick={signOut} aria-label="Sign out"><LogOut /></Button>
        </div>
      </div>
      {mobile ? <div className="h-3" /> : null}
    </div>
  );
}

export default function Sidebar(props) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 border-r bg-sidebar lg:flex">
      <GroupRail activeGroup={props.activeGroup} visibleItems={props.visibleItems} />
      <div className="min-w-0 flex-1"><SidebarContent {...props} /></div>
    </aside>
  );
}
