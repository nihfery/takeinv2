'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Moon,
  PanelLeft,
  RefreshCw,
  Search,
  Settings2,
  Store,
  Sun,
  UserRound,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import { accountScope } from '../config/navigation';
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
    return visibleItems.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(needle));
  }, [query, visibleItems]);

  function selectItem(key) {
    navigateProvider(key);
    setQuery('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setQuery(''); onOpenChange(next); }}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Search provider console</DialogTitle>
          <DialogDescription>Open a menu available for this provider account.</DialogDescription>
        </DialogHeader>
        <div className="relative border-b p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookings, services, payments..." className="pl-9" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length ? results.map((item) => {
            const Icon = item.icon;
            return (
              <Button key={item.key} variant="ghost" className="h-auto w-full justify-start gap-3 px-2.5 py-2 text-left" onClick={() => selectItem(item.key)}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background"><Icon className="size-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.label}</strong><span className="block truncate text-xs font-normal text-muted-foreground">{item.description}</span></span>
                {item.key === selected ? <Badge variant="secondary" className="text-[9px]">Current</Badge> : null}
              </Button>
            );
          }) : <div className="px-4 py-10 text-center text-sm text-muted-foreground">No accessible menu matches your search.</div>}
        </div>
        <div className="flex justify-between border-t bg-muted/35 px-4 py-2 text-[10px] text-muted-foreground"><span>{results.length} menu results</span><span>Esc to close</span></div>
      </DialogContent>
    </Dialog>
  );
}

export default function Topbar({ user, visibleItems, activeGroup, selected, signOut, loading, reload, sidebarCollapsed = false, onToggleSidebar }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const scope = accountScope(user);
  const ScopeIcon = scope.type === 'central' ? Building2 : Store;
  const profileVisible = visibleItems.some((item) => item.key === 'profile');
  const chatVisible = visibleItems.some((item) => item.key === 'chat');
  const notificationsVisible = visibleItems.some((item) => item.key === 'notifications');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('takein-provider-theme');
    const shouldUseDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', shouldUseDark);
    setDarkMode(shouldUseDark);
    function openSearch(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem('takein-provider-theme', next ? 'dark' : 'light');
    setDarkMode(next);
  }

  return (
    <>
      <header className={cn(
        'fixed inset-x-0 top-0 z-40 h-12 border-b bg-background/90 backdrop-blur-md transition-[left] duration-200 lg:left-68',
        sidebarCollapsed && 'lg:left-16',
      )}>
        <div className="flex h-full items-center gap-2 px-3 lg:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation" />}><Menu /></SheetTrigger>
            <SheetContent side="left" className="w-[272px] max-w-[88vw] gap-0 p-0">
              <SheetTitle className="sr-only">Provider navigation</SheetTitle>
              <SheetDescription className="sr-only">Navigate the TAKEIN provider console.</SheetDescription>
              <SidebarContent selected={selected} user={user} signOut={signOut} activeGroup={activeGroup} visibleItems={visibleItems} mobile onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} />}><PanelLeft /></TooltipTrigger>
            <TooltipContent>{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 hidden h-5 lg:block" />

          <button type="button" onClick={() => setSearchOpen(true)} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 text-left shadow-xs transition-colors hover:bg-muted/50 sm:max-w-sm lg:max-w-md">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">Search...</span>
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-0.5">
            <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={reload} disabled={loading} aria-label="Refresh data" />}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</TooltipTrigger><TooltipContent>Refresh Go data</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label={darkMode ? 'Use light theme' : 'Use dark theme'} />}>{darkMode ? <Sun /> : <Moon />}</TooltipTrigger><TooltipContent>{darkMode ? 'Light theme' : 'Dark theme'}</TooltipContent></Tooltip>
            {chatVisible ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={() => navigateProvider('chat')} aria-label="Messages" />}><Mail /></TooltipTrigger><TooltipContent>Messages</TooltipContent></Tooltip> : null}
            {notificationsVisible ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => navigateProvider('notifications')} aria-label="Notifications" />}><span className="relative"><Bell className="size-4" /><span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-red-500 ring-2 ring-background" /></span></TooltipTrigger><TooltipContent>Notifications</TooltipContent></Tooltip> : null}

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="ml-1 h-8 gap-1.5 rounded-lg px-1.5" aria-label="Open account menu" />}>
                <Avatar className="size-6 rounded-md"><AvatarFallback className="rounded-md bg-primary text-[8px] text-primary-foreground">{initials(user?.name || user?.email)}</AvatarFallback></Avatar>
                <span className="hidden max-w-28 truncate text-xs font-medium xl:block">{user?.name || 'Provider'}</span>
                <ChevronDown className="hidden size-3 text-muted-foreground xl:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="p-2 font-normal"><span className="flex items-center gap-2"><Avatar className="size-9 rounded-lg"><AvatarFallback className="rounded-lg bg-primary text-xs text-primary-foreground">{initials(user?.name || user?.email)}</AvatarFallback></Avatar><span className="min-w-0"><strong className="block truncate text-sm">{user?.name || 'Provider'}</strong><span className="block truncate text-xs text-muted-foreground">{user?.email}</span></span></span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled><ScopeIcon />{scope.label}<Badge variant="secondary" className="ml-auto text-[9px]">{scope.type.toUpperCase()}</Badge></DropdownMenuItem>
                <DropdownMenuItem disabled><CheckCircle2 className="text-emerald-600" />Go services connected</DropdownMenuItem>
                <DropdownMenuSeparator />
                {profileVisible ? <><DropdownMenuItem onClick={() => navigateProvider('profile')}><UserRound />Business profile</DropdownMenuItem><DropdownMenuItem onClick={() => navigateProvider('profile')}><Settings2 />Provider settings</DropdownMenuItem></> : <DropdownMenuItem disabled><Settings2 />Managed by Head Office</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <DashboardSearch open={searchOpen} onOpenChange={setSearchOpen} visibleItems={visibleItems} selected={selected} />
    </>
  );
}
