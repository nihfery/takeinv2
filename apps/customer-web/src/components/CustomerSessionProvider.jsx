'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionUser, setSessionUser } from '../lib/mock-state.js';
import { fetchCurrentCustomer, getCustomerActivitySummary } from '../lib/auth-api.js';

const CustomerSessionContext = createContext(null);

function InternalLinkNavigation() {
    const router = useRouter();

    useEffect(() => {
        function navigateWithoutReload(event) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!link || link.dataset.fullNavigation === 'true' || link.hasAttribute('download')) {
                return;
            }

            const target = link.getAttribute('target');
            const rawHref = link.getAttribute('href') || '';
            if (target && target !== '_self' || !rawHref || rawHref.startsWith('#')) {
                return;
            }

            const destination = new URL(link.href, window.location.href);
            if (destination.origin !== window.location.origin) {
                return;
            }

            // Let same-page hash links keep their native scrolling behaviour.
            const current = new URL(window.location.href);
            if (destination.pathname === current.pathname
                && destination.search === current.search
                && destination.hash) {
                return;
            }

            event.preventDefault();
            router.push(`${destination.pathname}${destination.search}${destination.hash}`);
        }

        document.addEventListener('click', navigateWithoutReload);
        return () => document.removeEventListener('click', navigateWithoutReload);
    }, [router]);

    return null;
}

export function CustomerSessionProvider({ children }) {
    const [session, setSession] = useState({ loggedIn: false, user: null });
    const [sessionReady, setSessionReady] = useState(false);
    const [activityCount, setActivityCount] = useState(0);

    useEffect(() => {
        let cancelled = false;

        function applySession(nextSession) {
            if (cancelled) return;
            setSession(nextSession);
            setSessionReady(true);
        }

        // Restore the in-tab display cache immediately, then verify the
        // HttpOnly Go JWT session through the same-origin Next.js BFF.
        // This provider lives in the root layout, so this work happens only once
        // for client-side navigation instead of on every page's navbar mount.
        const localSession = getSessionUser();
        if (localSession.loggedIn) {
            applySession(localSession);
        }

        function handleSessionChange(event) {
            applySession(event.detail || getSessionUser());
        }

        window.addEventListener('salonku-session-change', handleSessionChange);

        async function syncSession() {
            try {
                const auth = await fetchCurrentCustomer();
                if (cancelled) return;

                const nextSession = { loggedIn: true, user: auth.profile };
                setSessionUser(nextSession);
                applySession(nextSession);
            } catch {
                if (cancelled) return;

                setSessionUser({ loggedIn: false, user: null });
                applySession({ loggedIn: false, user: null });
            }
        }

        syncSession();

        return () => {
            cancelled = true;
            window.removeEventListener('salonku-session-change', handleSessionChange);
        };
    }, []);

    useEffect(() => {
        const isLoggedIn = Boolean(sessionReady && session?.loggedIn);
        let cancelled = false;

        async function updateActivityCount(event) {
            if (!isLoggedIn) {
                setActivityCount(0);
                return;
            }

            try {
                const preferCache = event?.type !== 'salonku-activity-change';
                const summary = await getCustomerActivitySummary({ preferCache })
                    .catch(() => ({ count: 0 }));

                if (!cancelled) {
                    setActivityCount(Number(summary?.count || 0));
                }
            } catch {
                if (!cancelled) setActivityCount(0);
            }
        }

        updateActivityCount();
        window.addEventListener('salonku-activity-change', updateActivityCount);
        window.addEventListener('storage', updateActivityCount);

        return () => {
            cancelled = true;
            window.removeEventListener('salonku-activity-change', updateActivityCount);
            window.removeEventListener('storage', updateActivityCount);
        };
    }, [sessionReady, session?.loggedIn, session?.user?.id, session?.user?.email]);

    const value = useMemo(
        () => [session, setSession, sessionReady, activityCount],
        [session, sessionReady, activityCount]
    );

    return (
        <CustomerSessionContext.Provider value={value}>
            <InternalLinkNavigation />
            {children}
        </CustomerSessionContext.Provider>
    );
}

export function useCustomerSessionState() {
    const context = useContext(CustomerSessionContext);

    if (!context) {
        throw new Error('useCustomerSessionState must be used within CustomerSessionProvider.');
    }

    return context;
}
