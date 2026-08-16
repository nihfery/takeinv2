'use client';

import { Bell, LogOut, Menu, RefreshCw, Search, Settings, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { initials } from '../formatters';
import { SidebarContent } from './admin-sidebar';

export function AdminHeader({ selected, selectedLabel, user, query, setQuery, loading, load, signOut }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon" aria-label="Open navigation" />}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="left" showCloseButton className="w-[286px] max-w-[86vw] gap-0 p-0">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              <SheetDescription className="sr-only">Navigate through the TAKEIN admin workspace.</SheetDescription>
              <SidebarContent selected={selected} user={user} signOut={signOut} mobile />
            </SheetContent>
          </Sheet>
        </div>

        <Breadcrumb className="hidden min-w-0 md:block">
          <BreadcrumbList>
            <BreadcrumbItem><span className="text-muted-foreground">Admin</span></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{selectedLabel}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          {selected !== 'overview' ? (
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${selectedLabel.toLowerCase()}…`}
                className="w-[230px] bg-muted/40 pl-9 lg:w-[310px]"
              />
            </div>
          ) : null}

          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh data" />}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
            </TooltipTrigger>
            <TooltipContent>Refresh service data</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Notifications" />}>
              <span className="relative">
                <Bell className="size-4" />
                <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-rose-500 ring-2 ring-background" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">No new platform alerts.</div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="Open account menu" />}>
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">
                  {initials(user?.name || user?.email)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate text-sm font-medium xl:block">{user?.name || 'Administrator'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block font-medium">{user?.name || 'Administrator'}</span>
                <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled><UserRound />Administrator account</DropdownMenuItem>
              <DropdownMenuItem disabled><Settings />Workspace settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={signOut}><LogOut />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selected !== 'overview' ? (
        <div className="border-t px-4 py-3 sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${selectedLabel.toLowerCase()}…`}
              className="bg-muted/40 pl-9"
            />
          </div>
        </div>
      ) : null}
    </header>
  );
}
