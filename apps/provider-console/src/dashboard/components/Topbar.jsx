'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { accountScope, itemForSection } from '../config/navigation';
import { navigateProvider } from './ProviderNavLink';
import { SidebarContent } from './Sidebar';

function initials(value) {
  return String(value || 'P').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function DashboardSearch({ open, onOpenChange, visibleItems, selected }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return visibleItems;
    return visibleItems.filter((entry) => `${entry.label} ${entry.description}`.toLowerCase().includes(needle));
  }, [query, visibleItems]);

  function selectItem(key) {
    navigateProvider(key);
    setQuery('');
    onOpenChange(false);
  }

  function changeOpen(nextOpen) {
    if (!nextOpen) setQuery('');
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Search provider workspace</DialogTitle>
          <DialogDescription>Open any dashboard page available to your account.</DialogDescription>
        </DialogHeader>
        <div className="relative border-b p-3">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search bookings, customers, reports..."
            className="h-10 pl-9"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length ? results.map((entry) => {
            const Icon = entry.icon;
            const current = entry.key === selected;
            return (
              <Button
                key={entry.key}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-left"
                onClick={() => selectItem(entry.key)}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background"><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{entry.label}</span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{entry.description}</span>
                </span>
                {current ? <Badge variant="secondary" className="text-[9px]">Current</Badge> : null}
              </Button>
            );
          }) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">No menu found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try another dashboard menu name.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/35 px-4 py-2 text-[10px] text-muted-foreground">
          <span>{results.length} accessible menus</span>
          <span>ESC to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Topbar({ user, visibleItems, activeGroup, selected, signOut, loading, reload }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const item = itemForSection(selected);
  const scope = accountScope(user);
  const ScopeIcon = scope.type === 'central' ? Building2 : Store;
  const profileVisible = visibleItems.some((entry) => entry.key === 'profile');
  const chatVisible = visibleItems.some((entry) => entry.key === 'chat');
  const notificationsVisible = visibleItems.some((entry) => entry.key === 'notifications');

  useEffect(() => {
    function openSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/95 shadow-[0_1px_2px_rgb(0_0_0/0.03)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:left-72">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-4 lg:gap-3 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation" />}><Menu /></SheetTrigger>
            <SheetContent side="left" className="w-[288px] max-w-[88vw] gap-0 p-0">
              <SheetTitle className="sr-only">Provider navigation</SheetTitle>
              <SheetDescription className="sr-only">Navigate through the TAKEIN provider console.</SheetDescription>
              <SidebarContent selected={selected} user={user} signOut={signOut} activeGroup={activeGroup} visibleItems={visibleItems} mobile onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap text-xs">
                <BreadcrumbItem className="hidden sm:inline-flex"><span className="text-muted-foreground">Provider</span></BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:inline-flex" />
                <BreadcrumbItem className="hidden md:inline-flex"><span>{activeGroup.label}</span></BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:inline-flex" />
                <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate font-medium">{item.label}</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <p className="mt-0.5 hidden truncate text-[10px] text-muted-foreground xl:block">{item.description}</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="hidden h-9 w-full max-w-64 justify-start gap-2 px-3 text-muted-foreground md:flex xl:max-w-80"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left text-xs font-normal">Search dashboard...</span>
            <Badge variant="secondary" className="h-5 rounded px-1.5 font-mono text-[9px]">Ctrl K</Badge>
          </Button>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="Search dashboard" />}><Search /></TooltipTrigger>
            <TooltipContent>Search dashboard</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 hidden h-7 sm:block" />

          <Badge variant="outline" className="hidden h-8 gap-1.5 rounded-lg px-2.5 text-[10px] font-medium xl:inline-flex">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            Go services online
          </Badge>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={reload} disabled={loading} aria-label="Refresh dashboard data" />}>
              {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            </TooltipTrigger>
            <TooltipContent>Refresh dashboard data</TooltipContent>
          </Tooltip>
          {chatVisible ? (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => navigateProvider('chat')} aria-label="Messages" />}><MessageCircle /></TooltipTrigger>
              <TooltipContent>Messages</TooltipContent>
            </Tooltip>
          ) : null}
          {notificationsVisible ? (
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => navigateProvider('notifications')} aria-label="Notifications" />}>
                <span className="relative"><Bell className="size-4" /><span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-orange-500 ring-2 ring-background" /></span>
              </TooltipTrigger>
              <TooltipContent>Notifications</TooltipContent>
            </Tooltip>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="h-9 gap-2 px-1.5 sm:pr-2.5" aria-label="Open account menu" />}>
              <Avatar className="size-6"><AvatarFallback className="bg-foreground text-[9px] text-background">{initials(user?.name || user?.email)}</AvatarFallback></Avatar>
              <span className="hidden min-w-0 text-left lg:block">
                <span className="block max-w-28 truncate text-xs font-medium leading-none">{user?.name || 'Provider'}</span>
                <span className="mt-1 block max-w-28 truncate text-[9px] leading-none text-muted-foreground">{scope.label}</span>
              </span>
              <ChevronDown className="hidden size-3 text-muted-foreground lg:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="p-2 font-normal">
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-9"><AvatarFallback className="bg-foreground text-xs text-background">{initials(user?.name || user?.email)}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{user?.name || 'Provider'}</span><span className="block truncate text-[10px] text-muted-foreground">{user?.email}</span></span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Workspace</DropdownMenuLabel>
              <DropdownMenuItem disabled className="py-2"><ScopeIcon /><span className="flex-1">{scope.label}</span><Badge variant={scope.type === 'central' ? 'default' : 'secondary'} className="text-[8px]">{scope.type === 'central' ? 'CENTRAL' : 'BRANCH'}</Badge></DropdownMenuItem>
              <DropdownMenuItem disabled><CheckCircle2 className="text-emerald-600" />Go services connected</DropdownMenuItem>
              <DropdownMenuSeparator />
              {profileVisible ? (
                <>
                  <DropdownMenuItem onClick={() => navigateProvider('profile')}><UserRound />Business profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigateProvider('profile')}><Settings2 />Provider settings</DropdownMenuItem>
                </>
              ) : <DropdownMenuItem disabled><ShieldCheck />Managed by Head Office</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <DashboardSearch open={searchOpen} onOpenChange={setSearchOpen} visibleItems={visibleItems} selected={selected} />
    </>
  );
}
