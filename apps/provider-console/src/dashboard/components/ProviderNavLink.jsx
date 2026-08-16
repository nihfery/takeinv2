'use client';

import { forwardRef } from 'react';
import { navItems, routeFor } from '../config/navigation';

export function providerSectionFromPath(pathname, fallback = 'overview') {
  const normalized = String(pathname || '').replace(/\/+$/, '') || '/';
  if (normalized === '/provider/dashboard') return 'overview';
  const prefix = '/provider/dashboard/';
  const candidate = normalized.startsWith(prefix) ? decodeURIComponent(normalized.slice(prefix.length).split('/')[0]) : fallback;
  return navItems.some((item) => item.key === candidate) ? candidate : fallback;
}

export function navigateProvider(section, options = {}) {
  if (typeof window === 'undefined') return;
  const href = routeFor(section);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === href) return;
  if (options.replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'auto' });
}

const ProviderNavLink = forwardRef(function ProviderNavLink({ section, href, onClick, target, children, ...props }, ref) {
  const destination = href || routeFor(section);

  function navigate(event) {
    onClick?.(event);
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || target === '_blank'
    ) return;
    event.preventDefault();
    navigateProvider(section || providerSectionFromPath(destination));
  }

  return <a ref={ref} href={destination} target={target} onClick={navigate} {...props}>{children}</a>;
});

export default ProviderNavLink;
