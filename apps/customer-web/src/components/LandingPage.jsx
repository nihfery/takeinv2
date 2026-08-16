'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { setSessionUser } from '../lib/mock-state.js';
import { logoutCustomer } from '../lib/auth-api.js';
import { getSalonPath } from '../lib/salon-routes.js';
import { buildServiceTaxonomy, fallbackServiceTaxonomy, getCategoryPath } from '../lib/service-taxonomy.js';
import { PROVIDER_FRONTEND_URL } from '../lib/app-urls.js';
import { useCustomerSessionState } from './CustomerSessionProvider.jsx';
import SalonMap from './SalonMap.jsx';
import {

    ArrowRight,
    BadgeCheck,
    Bell,
    Building2,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock,
    Globe2,
    Grid,
    Heart,
    Leaf,
    LocateFixed,
    LogOut,
    MapPin,
    Menu,
    MessageCircle,
    Palette,
    QrCode,
    Scissors,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Smartphone,
    Sparkles,
    Star,
    Store,
    Settings,
    ShoppingBag,
    Users,
    User,
    Ticket,
    Wallet,
    X,
} from 'lucide-react';

function cx(...classes) {
    return classes.filter(Boolean).join(' ');
}

function GooglePlayMark({ size = 26 }) {
    return (
        <svg className="fresh-google-play-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.2 2.2 13.5 12 3.2 21.8c-.5-.4-.8-1-.8-1.7V3.9c0-.7.3-1.3.8-1.7Z" fill="#4FC3F7" />
            <path d="m13.5 12 3.2 3.05-10.3 6.75 7.1-9.8Z" fill="#FBC02D" />
            <path d="m13.5 12 3.2-3.05-10.3-6.75 7.1 9.8Z" fill="#43A047" />
            <path d="M16.7 8.95 20 11.1c.9.58.9 1.22 0 1.8l-3.3 2.15L13.5 12l3.2-3.05Z" fill="#EF5350" />
        </svg>
    );
}


const EO = 'cubic-bezier(0, 0.55, 0.45, 1)';
const EIO = 'cubic-bezier(0.85, 0, 0.15, 1)';





const phoneCardBase = {
    position: 'absolute',
    width: '238px',
    overflow: 'hidden',
    border: '2px solid var(--color-primary)',
    borderRadius: '28px',
    background: '#ffffff',
    boxShadow: 'elevated',
};
const phoneText = {
    '& strong': { display: 'block', marginBottom: '4px', overflow: 'hidden', fontSize: '14px', lineHeight: '18px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    '& small': { display: 'block', overflow: 'hidden', color: 'foreground.muted', fontSize: '11px', lineHeight: '14px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};



const shellBaseObj = {
    position: 'relative',
    width: 'min(100%, 1148px)',
    marginTop: '62px',
    borderRadius: 'pill',
    backdropFilter: 'saturate(1.5) blur(10px)',
};
const formObj = {
    position: 'relative',
    zIndex: '1',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(190px, 0.58fr) auto',
    alignItems: 'stretch',
    gap: '0',
    minHeight: '64px',
    margin: '0',
    padding: '0',
    background: 'background.page',
    borderRadius: 'pill',
    boxShadow: 'inset 0 0 0 1px #ebe3d8',
};
const fieldObj = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    minWidth: '0',
    minHeight: '64px',
    padding: '0 24px',
    border: '0',
    borderRadius: 'pill',
    color: 'foreground.neutral',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: `background-color 200ms ${EO}, box-shadow 200ms ${EO}, transform 200ms ${EO}`,
    '&:not(:first-child)::before': { position: 'absolute', top: '50%', left: '0', width: '1px', height: '24px', content: '""', background: '#ebe3d8', transform: 'translateY(-50%)' },
    '&:hover': { background: 'background.neutral' },
    '&:active': { transform: 'scale(0.97)' },
    '&[aria-expanded="true"]': { position: 'relative', zIndex: '2', background: 'background.page', boxShadow: 'inset 0 0 0 1px #ebe3d8, 0 6px 16px rgba(19, 19, 19, 0.1)' },
    '&[aria-expanded="true"]::before, &[aria-expanded="true"] + &::before, &:hover::before, &:hover + &::before': { content: 'none' },
    '& svg': { flex: '0 0 auto', color: 'foreground.muted' },
    '& span': { minWidth: '0', overflow: 'hidden', fontSize: '15px', fontWeight: '500', lineHeight: '20px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
const submitObj = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '76px',
    height: '48px',
    margin: '8px 8px 8px 12px',
    padding: '0 22px',
    border: '2px solid #1a1718',
    borderRadius: 'pill',
    color: '#ffffff',
    background: 'primary',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    transition: `background-color 200ms ${EO}, transform 200ms ${EO}`,
    '&:hover': { background: 'primary.hover' },
    '&:active': { transform: 'scale(0.96)' },
};
const optionBtn = { display: 'flex', alignItems: 'center', gap: '12px', minWidth: '0', minHeight: '48px', padding: '10px 12px', border: '0', borderRadius: 'm', color: 'foreground.neutral', background: 'transparent', cursor: 'pointer', textAlign: 'left' };
const optionIcon = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: 'pill', color: 'accent', background: 'accent.soft' };
const optionLabel = { overflow: 'hidden', fontSize: '14px', fontWeight: '500', lineHeight: '20px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const panelText = { '& button, & strong, & b, & small, & span': { fontFamily: 'body' } };



export const servicePills = [
    { label: 'All treatments', value: 'all', icon: Grid, terms: [] },
    { label: 'Haircut', value: 'haircut', icon: Scissors, terms: ['hair', 'rambut', 'potong', 'barber'] },
    { label: 'Hair Color', value: 'color', icon: Palette, terms: ['color', 'warna', 'rambut'] },
    { label: 'Nails', value: 'nail', icon: Sparkles, terms: ['nail', 'kuku'] },
    { label: 'Facial', value: 'facial', icon: Leaf, terms: ['facial', 'wajah', 'medspa'] },
    { label: 'Spa & Massage', value: 'spa', icon: Sparkles, terms: ['spa', 'pijat', 'massage'] },
];

const searchCategoryTabs = ['All', 'Treatments', 'Venues', 'Professionals'];

const recentSearches = [
    { title: 'All treatments', subtitle: 'Any time', value: 'all' },
    { title: 'Hair styling', subtitle: 'Any time', value: 'haircut' },
];

const sectionNavItems = [
    { id: 'rekomendasi', label: 'Explore' },
    { id: 'app', label: 'App' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'business', label: 'Business' },
];

const navItems = [
    { id: 'features', label: 'Features', menu: 'features' },
    { id: 'discover', label: 'Explore', href: '#rekomendasi', sectionId: 'rekomendasi' },
    { id: 'business-menu', label: 'For business', menu: 'business', sectionId: 'business' },
    { id: 'app', label: 'App', href: '#app', sectionId: 'app' },
    { id: 'reviews', label: 'Reviews', href: '#reviews', sectionId: 'reviews' },
];

const megaMenus = {
    features: {
        eyebrow: 'For customers',
        title: 'Everything you need to book a salon in one seamless flow.',
        ctaLabel: 'Find salons nearby',
        ctaHref: '/search',
        cards: [
            {
                title: 'Find a salon',
                text: 'Compare location, ratings, services, and prices before booking.',
                href: '/search',
                icon: Search,
                featured: true,
                tone: 'orange',
                preview: 'Nearby salons',
            },
            {
                title: 'Booking',
                text: 'Choose a date, time, and branch without endless back-and-forth chats.',
                href: '#rekomendasi',
                icon: CalendarDays,
    Check,
                tone: 'violet',
                preview: 'Open slots',
            },
            {
                title: 'Reminders',
                text: 'Schedule reminders help you arrive on time.',
                href: '#app',
                icon: Bell,
                tone: 'emerald',
                preview: 'Reminder',
            },
            {
                title: 'Reviews',
                text: 'Read customer experiences before deciding.',
                href: '#reviews',
                icon: Star,
                tone: 'indigo',
                preview: 'Rating 5.0',
            },
            {
                title: 'App',
                text: 'Keep favourites, history, and schedules in one place.',
                href: '#app',
                icon: Smartphone,
                tone: 'plum',
                preview: 'App',
            },
            {
                title: 'Reliable',
                text: 'Clear booking details, verified salons, and flexible payments.',
                href: '#business',
                icon: ShieldCheck,
                tone: 'lime',
                preview: 'Reliable',
            },
        ],
        links: [
            { label: 'Popular categories', href: '#rekomendasi' },
            { label: 'Recommended salons', href: '#rekomendasi' },
            { label: 'Download the app', href: '#app' },
            { label: 'Customer support', href: '/auth' },
            { label: 'Customer reviews', href: '#reviews' },
            { label: 'Available cities', href: '#rekomendasi' },
        ],
        aboutLinks: [
            { label: 'Login customer', href: '/auth' },
            { label: 'Register your salon business', href: 'provider' },
            { label: 'Blog', href: '/articles' },
            { label: 'Help centre', href: '/auth' },
        ],
        followLinks: [
            { label: 'X', href: 'https://x.com' },
            { label: 'IG', href: 'https://instagram.com' },
            { label: 'in', href: 'https://linkedin.com' },
        ],
    },
    business: {
        eyebrow: 'For salon businesses',
        title: 'Manage bookings, customers, and branches from one calm dashboard.',
        ctaLabel: 'Register your business',
        ctaHref: 'provider',
        cards: [
            {
                title: 'Dashboard',
                text: 'Monitor services, staff, and daily reservations in one place.',
                href: 'provider',
                icon: Building2,
                featured: true,
                tone: 'indigo',
                preview: 'Pro',
            },
            {
                title: 'Kalender',
                text: 'Set opening hours, service duration, and available slots quickly.',
                href: '#business',
                icon: Clock,
                tone: 'lime',
                preview: 'Schedule',
            },
            {
                title: 'Katalog',
                text: 'Showcase prices, categories, photos, and featured promotions.',
                href: '#business',
                icon: Store,
    ShoppingBag,
                tone: 'orange',
                preview: 'Services',
            },
            {
                title: 'Customers',
                text: 'Build relationships through visit history and customer preferences.',
                href: '#business',
                icon: Users,
                tone: 'emerald',
                preview: 'Customer',
            },
            {
                title: 'Branches',
                text: 'Manage staff, rooms, and branches without losing service rhythm.',
                href: 'provider',
                icon: MapPin,
                tone: 'violet',
                preview: 'Branches',
            },
            {
                title: 'Promotions',
                text: 'Highlight new services and favourite packages for local customers.',
                href: 'provider',
                icon: Sparkles,
                tone: 'plum',
                preview: 'Promo',
            },
        ],
        links: [
            { label: 'Business features', href: '#business' },
            { label: 'Provider sign in', href: 'provider' },
            { label: 'View the customer app', href: '#app' },
            { label: 'Contact the YouYaku team', href: 'provider' },
            { label: 'Service catalogue', href: '#business' },
            { label: 'Branch dashboard', href: 'provider' },
        ],
        aboutLinks: [
            { label: 'About YouYaku', href: '#business' },
            { label: 'Partner support', href: 'provider' },
            { label: 'Careers', href: '/articles' },
            { label: 'Articles', href: '/articles' },
        ],
        followLinks: [
            { label: 'X', href: 'https://x.com' },
            { label: 'IG', href: 'https://instagram.com' },
            { label: 'in', href: 'https://linkedin.com' },
        ],
    },
};

export function todayInputValue() {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function parseInputDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function toInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateLabel(value) {
    const date = parseInputDate(value);
    if (!date) return 'Kapan saja';
    return `${DAY_LABELS[date.getDay()]}, ${date.getDate()} ${MONTH_LABELS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

function buildCalendarDays(viewYear, viewMonth) {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) {
        cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(new Date(viewYear, viewMonth, day));
    }
    return cells;
}

function formatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatPrice(value) {
    const price = Number(value || 0);
    if (!price) return 'Harga tersedia';
    return `From IDR ${price.toLocaleString('en-US')}`;
}

function branchLocation(branch) {
    return [branch?.city, branch?.state].filter(Boolean).join(', ') || 'Indonesia';
}

function branchMatchesService(branch, serviceValue) {
    if (!serviceValue || serviceValue === 'all') return true;

    const service = servicePills.find((item) => item.value === serviceValue);
    if (!service) return true;

    const haystack = [
        branch?.name,
        branch?.provider,
        branch?.city,
        ...(Array.isArray(branch?.serviceCategories) ? branch.serviceCategories : []),
    ].join(' ').toLowerCase();

    return service.terms.some((term) => haystack.includes(term));
}

function branchMatchesLocation(branch, locationQuery) {
    const query = String(locationQuery || '').trim().toLowerCase();
    if (!query || query === 'lokasi saat ini') return true;

    return branchLocation(branch).toLowerCase().includes(query);
}

function ServiceIcon({ value, size = 18 }) {
    const Icon = servicePills.find((item) => item.value === value)?.icon || Sparkles;
    return <Icon size={size} strokeWidth={2.2} />;
}

// When the page is opened from another device on the local network (e.g. a phone
// at http://192.168.x.x:5174), absolute links that still point to 127.0.0.1 would
// resolve to the visitor's own machine. Rewrite the loopback host to the host the
// page was actually loaded from so cross-app links keep working across the LAN.
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function localizeLoopbackUrl(url, hostname) {
    const normalized = String(url || '').replace(/\/$/, '');
    if (!hostname || loopbackHosts.has(String(hostname).toLowerCase())) return normalized;
    try {
        const parsed = new URL(normalized);
        if (loopbackHosts.has(parsed.hostname.toLowerCase())) {
            parsed.hostname = hostname;
        }
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return normalized;
    }
}

function useLocalizedUrl(url) {
    const [resolved, setResolved] = useState(url);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setResolved(localizeLoopbackUrl(url, window.location.hostname));
        }
    }, [url]);
    return resolved;
}

function resolveMenuHref(href, providerUrl) {
    return href === 'provider' ? providerUrl : href;
}

function sessionDisplayName(session) {
    return session?.user?.name || session?.user?.email || 'Customer';
}

function sessionInitial(session) {
    return sessionDisplayName(session).trim().charAt(0).toUpperCase() || 'C';
}

function MegaMenuContent({ menu, providerUrl, closeMenu }) {
    return (
        <>
            <div className="mega-menu-head">
                <div>
                    <small>{menu.eyebrow}</small>
                    <strong>{menu.title}</strong>
                </div>
                <a className="mega-menu-kicker" href={resolveMenuHref(menu.ctaHref, providerUrl)} onClick={closeMenu}>
                    <span>{menu.ctaLabel}</span>
                    <ArrowRight size={15} />
                </a>
            </div>
            <div className="mega-menu-layout">
                <div className="mega-menu-grid">
                    {menu.cards.map((card) => {
                        const Icon = card.icon;

                        return (
                            <a
                                className={`mega-card tone-${card.tone || 'neutral'}${card.featured ? ' featured' : ''}`}
                                href={resolveMenuHref(card.href, providerUrl)}
                                key={card.title}
                                onClick={closeMenu}
                            >
                                <span className="mega-card-visual">
                                    <Icon size={34} />
                                    <em>{card.preview}</em>
                                </span>
                                <div className="mega-card-copy">
                                    <b>{card.title}</b>
                                    <small>{card.text}</small>
                                </div>
                                <ChevronRight className="mega-card-arrow" size={16} />
                            </a>
                        );
                    })}
                </div>
                <div className="mega-link-column">
                    <section className="mega-link-group primary">
                        <small>Explore More</small>
                        {menu.links.map((link) => (
                            <a href={resolveMenuHref(link.href, providerUrl)} key={link.label} onClick={closeMenu}>
                                <span>{link.label}</span>
                                <ChevronRight size={14} />
                            </a>
                        ))}
                    </section>
                    <section className="mega-link-group">
                        <small>About YouYaku</small>
                        {menu.aboutLinks.map((link) => (
                            <a href={resolveMenuHref(link.href, providerUrl)} key={link.label} onClick={closeMenu}>
                                <span>{link.label}</span>
                                <ChevronRight size={14} />
                            </a>
                        ))}
                    </section>
                    <section className="mega-link-group">
                        <small>Follow</small>
                        <div className="mega-social-row">
                            {menu.followLinks.map((link) => (
                                <a href={link.href} key={link.label} onClick={closeMenu}>
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}

function MobileMenuContent({ providerUrl, closeMenu, session = { loggedIn: false }, onLoginClick }) {
    const isLoggedIn = Boolean(session?.loggedIn);
    const accountLinks = [
        { label: 'Activity', href: '/activity', icon: CalendarDays, desc: 'Saved services, appointments, and history' },
        { label: 'Favorites', href: '/favorites', icon: Heart, desc: 'Saved salons and providers' },
        { label: 'Profile', href: '/profile', icon: User, desc: 'Account and contact details' },
        { label: 'Promotions', href: '/promos', icon: Ticket, desc: 'Available vouchers and offers' },
    ];
    const quickLinks = [
        { label: 'Discover', href: '/search', icon: Search },
        ...(isLoggedIn ? [
            { label: 'Activity', href: '/activity', icon: CalendarDays },
            { label: 'Wallet', href: '/profile', icon: Wallet },
            { label: 'Messages', href: '/profile', icon: MessageCircle }
        ] : [
            { label: 'Promotions', href: '/promos', icon: Ticket },
            { label: 'Reviews', href: '#reviews', icon: Star },
            { label: 'For Business', href: '#business', icon: Store }
        ])
    ];
    const professionalGroups = [
        {
            eyebrow: 'Booking',
            title: 'Appointments',
            cards: [
                { title: 'Find a service', text: 'Search salons, treatments, locations, and prices.', href: '/search', icon: Search, featured: true },
                { title: 'Activity', text: 'Track saved services, appointments, and booking history.', href: '/activity', icon: CalendarDays },
            ],
        },
        {
            eyebrow: 'Account',
            title: 'Customer tools',
            cards: [
                { title: 'Wallet', text: 'Payment methods and billing preferences.', href: '/profile', icon: Wallet, featured: true },
                { title: 'Messages', text: 'Provider updates and service conversations.', href: '/profile', icon: MessageCircle },
            ],
        },
        {
            eyebrow: 'Support',
            title: 'Help and business',
            cards: [
                { title: 'Help Center', text: 'Policies, cancellation rules, and customer support.', href: '/articles', icon: ShieldCheck, featured: true },
                { title: 'Business Portal', text: 'Manage a salon or register as a partner.', href: 'provider', icon: Store },
            ],
        },
    ];

    return (
        <>
            <div className="mega-menu-head">
                <div>
                    <small>{isLoggedIn ? 'Customer account' : 'YouYaku menu'}</small>
                    <strong>{isLoggedIn ? `Welcome, ${sessionDisplayName(session)}` : 'Explore and manage bookings'}</strong>
                </div>
                {isLoggedIn ? (
                    <a className="mega-menu-kicker" href="/profile" onClick={closeMenu}>Account</a>
                ) : (
                    <a className="mega-menu-kicker" href="/profile" onClick={(e) => { closeMenu(); onLoginClick(e); }}>Sign in</a>
                )}
            </div>
            {isLoggedIn && (
                <div className="mobile-account-panel">
                    <div className="mobile-account-avatar" aria-hidden="true">{sessionInitial(session)}</div>
                    <div className="mobile-account-copy">
                        <strong>{sessionDisplayName(session)}</strong>
                        <span>{session.user?.email || 'Active customer session'}</span>
                    </div>
                    <a href="/profile" onClick={closeMenu}>Manage</a>
                </div>
            )}
            <div className="mobile-quick-links">
                {quickLinks.map((item) => {
                    const Icon = item.icon;

                    return (
                        <a href={item.href} key={item.label} onClick={closeMenu}>
                            <Icon size={16} />
                            <span>{item.label}</span>
                        </a>
                    );
                })}
            </div>
            {isLoggedIn && (
                <section className="mobile-menu-group mobile-account-links">
                    <div className="mobile-menu-title">
                        <small>Account shortcuts</small>
                        <b>Customer workspace</b>
                    </div>
                    <div className="mobile-account-link-grid">
                        {accountLinks.map((item) => {
                            const Icon = item.icon;
                            return (
                                <a href={item.href} key={item.label} onClick={closeMenu}>
                                    <span><Icon size={17} /></span>
                                    <div>
                                        <b>{item.label}</b>
                                        <small>{item.desc}</small>
                                    </div>
                                    <ChevronRight size={15} />
                                </a>
                            );
                        })}
                    </div>
                </section>
            )}
            <div className="mobile-menu-groups">
                {professionalGroups.map((group) => (
                    <section className="mobile-menu-group" key={group.title}>
                        <div className="mobile-menu-title">
                            <small>{group.eyebrow}</small>
                            <b>{group.title}</b>
                        </div>
                        <div className="mega-menu-grid">
                            {group.cards.map((card) => {
                                const Icon = card.icon;

                                return (
                                    <a
                                        className={`mega-card${card.featured ? ' featured' : ''}`}
                                        href={resolveMenuHref(card.href, providerUrl)}
                                        key={card.title}
                                        onClick={closeMenu}
                                    >
                                        <span><Icon size={18} /></span>
                                        <div>
                                            <b>{card.title}</b>
                                            <small>{card.text}</small>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
            <div className="mega-menu-foot">
                {session.loggedIn ? (
                    <a href="/" onClick={async (e) => {
                        e.preventDefault();
                        closeMenu();
                        await logoutCustomer();
                        setSessionUser({ loggedIn: false, user: null });
                        window.location.reload();
                    }} style={{ color: '#c62828' }}>
                        <LogOut size={15} />
                        Sign out
                    </a>
                ) : (
                    <a href="/profile" onClick={(e) => { closeMenu(); onLoginClick(e); }}>Customer sign in</a>
                )}
                <a href={providerUrl} onClick={closeMenu}>Business portal</a>
            </div>
        </>
    );
}

export function Header({ providerUrl, searchSlot = null }) {
    const localProviderUrl = useLocalizedUrl(providerUrl);
    const [isMenuOpen, setMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState('');
    const [isScrolled, setScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('');
    const activeMega = activeDropdown ? megaMenus[activeDropdown] : null;
    const hasPanel = Boolean(isMenuOpen || activeMega);

    const [session, , sessionReady] = useCustomerSessionState();

    const handleLoginClick = (e) => {
        e.preventDefault();
        const next = window.location.pathname + window.location.search;
        window.location.href = `/auth?next=${encodeURIComponent(next === '/auth' ? '/' : next)}`;
    };

    const closeMenu = useCallback(() => {
        setMenuOpen(false);
        setActiveDropdown('');
    }, []);

    function openDropdown(menuKey) {
        setMenuOpen(false);
        setActiveDropdown(menuKey);
    }

    function toggleDropdown(menuKey) {
        if (activeDropdown === menuKey) {
            closeMenu();
            return;
        }

        openDropdown(menuKey);
    }

    function toggleMobileMenu() {
        if (isMenuOpen) {
            closeMenu();
            return;
        }

        setActiveDropdown('');
        setMenuOpen(true);
    }

    useEffect(() => {
        function updateScrollState() {
            setScrolled(window.scrollY > 16);
        }

        updateScrollState();
        window.addEventListener('scroll', updateScrollState, { passive: true });
        window.addEventListener('resize', updateScrollState);

        return () => {
            window.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
        };
    }, []);

    useEffect(() => {
        const sections = sectionNavItems
            .map((item) => document.getElementById(item.id))
            .filter(Boolean);

        if (!sections.length) return undefined;

        const ratios = new Map();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
            });

            let topId = '';
            let topRatio = 0;
            ratios.forEach((ratio, id) => {
                if (ratio > topRatio) {
                    topRatio = ratio;
                    topId = id;
                }
            });

            setActiveSection(topRatio > 0 ? topId : '');
        }, {
            rootMargin: '-32% 0px -52% 0px',
            threshold: [0, 0.12, 0.28, 0.48],
        });

        sections.forEach((section) => observer.observe(section));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        function closeWithEscape(event) {
            if (event.key === 'Escape') {
                closeMenu();
            }
        }

        document.addEventListener('keydown', closeWithEscape);
        return () => document.removeEventListener('keydown', closeWithEscape);
    }, [closeMenu]);

    useEffect(() => {
        if (!hasPanel) return undefined;

        const { body, documentElement } = document;
        const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

        const previous = {
            bodyOverflow: body.style.overflow,
            htmlOverflow: documentElement.style.overflow,
            bodyPaddingRight: body.style.paddingRight,
            bodyOverscroll: body.style.overscrollBehavior,
            htmlOverscroll: documentElement.style.overscrollBehavior,
            scrollbarComp: documentElement.style.getPropertyValue('--scrollbar-comp'),
        };

        documentElement.style.setProperty('--scrollbar-comp', `${scrollbarWidth}px`);
        body.style.overflow = 'hidden';
        documentElement.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${scrollbarWidth}px`;
        }
        body.style.overscrollBehavior = 'none';
        documentElement.style.overscrollBehavior = 'none';

        return () => {
            body.style.overflow = previous.bodyOverflow;
            documentElement.style.overflow = previous.htmlOverflow;
            body.style.paddingRight = previous.bodyPaddingRight;
            body.style.overscrollBehavior = previous.bodyOverscroll;
            documentElement.style.overscrollBehavior = previous.htmlOverscroll;
            documentElement.style.setProperty('--scrollbar-comp', previous.scrollbarComp);
        };
    }, [hasPanel]);

    useEffect(() => {
        if (!hasPanel) return undefined;

        function closeOnOutsideClick(event) {
            if (!event.target.closest?.('.site-nav')) {
                closeMenu();
            }
        }

        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, [closeMenu, hasPanel]);

    return (
        <header
            className={`site-nav ${isScrolled ? 'is-scrolled' : ''} ${isMenuOpen ? 'is-menu-open' : ''} ${hasPanel ? 'has-panel' : ''}`}
        >
            <div className="nav-inner">
                <a className="brand nav-brand" href="/" aria-label="YouYaku">
                    <span className="brand-mark">S</span>
                    <span className="brand-wordmark">YouYaku</span>
                </a>
                {searchSlot ? (
                    <div className="nav-search-slot">{searchSlot}</div>
                ) : null}
                <nav className="nav-actions" aria-label="Navigasi utama">
                    {!isMenuOpen && (session.loggedIn ? (
                        <a className="business-pill" href="/profile">
                            <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                <User size={14} />
                                {session.user?.name || 'Profil'}
                            </span>
                        </a>
                    ) : (
                        <a className="business-pill" href="/profile" onClick={handleLoginClick}>
                            <span>Login</span>
                        </a>
                    ))}
                    <button
                        className="nav-close-button"
                        type="button"
                        aria-hidden={!hasPanel || isMenuOpen}
                        aria-label="Tutup menu"
                        tabIndex={hasPanel && !isMenuOpen ? 0 : -1}
                        onClick={closeMenu}
                    >
                        <X size={26} />
                    </button>
                    <button
                        className="menu-button"
                        type="button"
                        aria-expanded={isMenuOpen}
                        aria-controls="nav-menu-panel"
                        aria-label="Menu"
                        onClick={toggleMobileMenu}
                    >
                        <span>{isMenuOpen ? 'Tutup' : 'Menu'}</span>
                        {isMenuOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </nav>
            </div>
            <AnimatePresence>
                {hasPanel && (
                    <>
                        {isMenuOpen && (
                            <motion.button
                                key="menu-scrim"
                                className="menu-scrim"
                                type="button"
                                aria-label="Tutup menu"
                                onClick={closeMenu}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                            />
                        )}
                        <motion.div
                            key="nav-panel"
                            className={`mega-menu${isMenuOpen ? ' mobile-panel' : ''}`}
                            id="nav-menu-panel"
                            role={isMenuOpen ? 'dialog' : 'menu'}
                            aria-label="Menu YouYaku"
                            style={{ animation: 'none' }}
                            initial={{ opacity: 0, y: -12, scale: 0.985 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.99 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {isMenuOpen ? (
                                <MobileMenuContent providerUrl={localProviderUrl} closeMenu={closeMenu} session={session} onLoginClick={handleLoginClick} />
                            ) : (
                                <MegaMenuContent menu={activeMega} providerUrl={localProviderUrl} closeMenu={closeMenu} />
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </header>
    );
}

function Calendar({ value, onSelect, onClear }) {
    const today = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }, []);

    const selected = parseInputDate(value);
    const initial = selected || today;
    const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

    const cells = useMemo(() => buildCalendarDays(view.year, view.month), [view]);
    const canGoPrev = view.year > today.getFullYear()
        || (view.year === today.getFullYear() && view.month > today.getMonth());

    function shiftMonth(step) {
        setView((current) => {
            const next = new Date(current.year, current.month + step, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
        });
    }

    return (
        <div className={'calendar'}>
            <div className={'calendar-head'}>
                <button
                    className={'calendar-nav'}
                    type="button"
                    aria-label="Previous month"
                    disabled={!canGoPrev}
                    onClick={() => shiftMonth(-1)}
                >
                    <ChevronLeft size={18} />
                </button>
                <strong>{MONTH_LABELS[view.month]} {view.year}</strong>
                <button
                    className={'calendar-nav'}
                    type="button"
                    aria-label="Next month"
                    onClick={() => shiftMonth(1)}
                >
                    <ChevronRight size={18} />
                </button>
            </div>
            <div className={'calendar-weekdays'}>
                {DAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                ))}
            </div>
            <div className={'calendar-grid'}>
                {cells.map((date, index) => {
                    if (!date) {
                        return <span className={cx('calendar-cell', 'empty')} key={`empty-${index}`} />;
                    }

                    const isPast = date < today;
                    const isSelected = selected && date.getTime() === selected.getTime();
                    const isToday = date.getTime() === today.getTime();

                    return (
                        <button
                            className={cx('calendar-cell', isSelected && 'selected', isToday && 'today')}
                            key={toInputValue(date)}
                            type="button"
                            disabled={isPast}
                            onClick={() => onSelect(toInputValue(date))}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>
            <div className={'calendar-foot'}>
                <button className={'calendar-clear'} type="button" onClick={onClear}>
                    Any time
                </button>
            </div>
        </div>
    );
}

function SearchPanel({
    activePanel,
    selectedService,
    setSelectedService,
    locationQuery,
    setLocationQuery,
    setLocationCity,
    locations,
    bookingDate,
    setBookingDate,
    setActivePanel,
}) {
    const [activeTab, setActiveTab] = useState(searchCategoryTabs[0]);
    const [recent, setRecent] = useState(recentSearches);
    const [detectingLocation, setDetectingLocation] = useState(false);

    function detectCurrentLocation() {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setLocationQuery('Current location');
            setLocationCity?.('');
            setActivePanel('');
            return;
        }

        setDetectingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                let displayLabel = '';
                let resolvedCity = '';
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=id&zoom=16`,
                        { headers: { Accept: 'application/json' } }
                    );
                    if (response.ok) {
                        const data = await response.json();
                        const address = data.address || {};

                        // Keep the actual GPS area for display.
                        const detail = address.suburb
                            || address.village
                            || address.neighbourhood
                            || address.city_district
                            || address.town
                            || address.hamlet
                            || data.name
                            || (data.display_name || '').split(',')[0]
                            || '';

                        // Resolve the CITY behind the GPS area so search returns results.
                        const knownCities = (locations || []).map((item) => item.city).filter(Boolean);
                        const candidates = [
                            address.city,
                            address.town,
                            address.municipality,
                            address.city_district,
                            address.county,
                            address.region,
                            address.state,
                        ].filter(Boolean);
                        const haystack = `${data.display_name || ''} ${candidates.join(' ')}`.toLowerCase();

                        resolvedCity = knownCities.find((city) => haystack.includes(city.toLowerCase()))
                            || (address.city || address.town || address.county || address.state || '')
                                .replace(/^(kota|kabupaten|kab\.?|kecamatan)\s+/i, '')
                                .trim();

                        displayLabel = detail || resolvedCity;
                    }
                } catch {
                    // Keep resilient if the geocoder is unreachable.
                }

                setLocationQuery(displayLabel || 'Current location');
                setLocationCity?.(resolvedCity || displayLabel || '');
                setDetectingLocation(false);
                setActivePanel('');
            },
            () => {
                setDetectingLocation(false);
                setLocationQuery('Current location');
                setLocationCity?.('');
                setActivePanel('');
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }

    if (!activePanel) return null;

    if (activePanel === 'service') {
        return (
            <div className={'search-panel service-panel'}>
                <div className={'panel-tabs'} role="tablist" aria-label="Kategori pencarian">
                    {searchCategoryTabs.map((tab) => (
                        <button
                            className={cx('panel-tab', activeTab === tab && 'active')}
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {recent.length > 0 && (
                    <div className={'panel-section'}>
                        <div className={'panel-section-head'}>
                            <strong>Terbaru</strong>
                            <button className={'panel-clear'} type="button" onClick={() => setRecent([])}>
                                Hapus
                            </button>
                        </div>
                        <div className={'recent-list'}>
                            {recent.map((item) => (
                                <button
                                    className={'recent-item'}
                                    key={item.title}
                                    type="button"
                                    onClick={() => {
                                        setSelectedService(item.value);
                                        setActivePanel('');
                                    }}
                                >
                                    <span className={'recent-icon'}><Search size={18} /></span>
                                    <span className={'recent-text'}>
                                        <b>{item.title}</b>
                                        <small>{item.subtitle}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className={'panel-section'}>
                    <div className={'panel-section-head'}>
                        <strong>Perawatan</strong>
                    </div>
                    <div className={'service-options'}>
                        {servicePills.map((item) => {
                            const Icon = item.icon;

                            return (
                                <button
                                    className={selectedService === item.value ? 'active' : ''}
                                    key={item.value}
                                    type="button"
                                    onClick={() => {
                                        setSelectedService(item.value);
                                        setActivePanel('');
                                    }}
                                >
                                    <span><Icon size={18} /></span>
                                    <b>{item.label}</b>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (activePanel === 'date') {
        return (
            <div className={'search-panel date-panel'}>
                <Calendar
                    value={bookingDate}
                    onSelect={(next) => {
                        setBookingDate(next);
                        setActivePanel('');
                    }}
                    onClear={() => {
                        setBookingDate('');
                        setActivePanel('');
                    }}
                />
            </div>
        );
    }

    return (
        <div className={'search-panel location-panel'}>
            <button
                className={'current-location'}
                type="button"
                disabled={detectingLocation}
                onClick={detectCurrentLocation}
            >
                <span><LocateFixed size={18} /></span>
                <b>{detectingLocation ? 'Mendeteksi lokasi...' : 'Gunakan lokasi saat ini'}</b>
            </button>
            <div className={'location-options'}>
                {locations.map((location) => (
                    <button
                        key={`${location.city}-${location.state}`}
                        type="button"
                        onClick={() => {
                            setLocationQuery(location.city);
                            setLocationCity?.(location.city);
                            setActivePanel('');
                        }}
                    >
                        <MapPin size={15} />
                        <span>{location.city}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function SearchExperience({
    selectedService,
    setSelectedService,
    locationQuery,
    setLocationQuery,
    setLocationCity,
    bookingDate,
    setBookingDate,
    locations,
    onSearch,
}) {
    const [activePanel, setActivePanel] = useState('');
    const serviceLabel = servicePills.find((item) => item.value === selectedService)?.label || 'All treatments';

    return (
        <form className={cx('search-shell', activePanel && 'is-open')} onSubmit={onSearch}>
            <div className={'search-form'}>
                <button
                    className={'search-field'}
                    type="button"
                    aria-expanded={activePanel === 'service'}
                    onClick={() => setActivePanel((current) => (current === 'service' ? '' : 'service'))}
                >
                    <Search size={18} />
                    <span>{serviceLabel}</span>
                </button>
                <button
                    className={'search-field'}
                    type="button"
                    aria-expanded={activePanel === 'location'}
                    onClick={() => setActivePanel((current) => (current === 'location' ? '' : 'location'))}
                >
                    <MapPin size={18} />
                    <span>{locationQuery || 'Current location'}</span>
                </button>
                <button
                    className={'search-field'}
                    type="button"
                    aria-expanded={activePanel === 'date'}
                    onClick={() => setActivePanel((current) => (current === 'date' ? '' : 'date'))}
                >
                    <CalendarDays size={18} />
                    <span>{formatDateLabel(bookingDate)}</span>
                </button>
                <button className={'search-submit'} type="submit">
                    Search
                </button>
            </div>
            <SearchPanel
                activePanel={activePanel}
                selectedService={selectedService}
                setSelectedService={setSelectedService}
                locationQuery={locationQuery}
                setLocationQuery={setLocationQuery}
                setLocationCity={setLocationCity}
                locations={locations}
                bookingDate={bookingDate}
                setBookingDate={setBookingDate}
                setActivePanel={setActivePanel}
            />
        </form>
    );
}

export function Footer({ providerUrl = PROVIDER_FRONTEND_URL, customerAppUrl = '/' } = {}) {
    return (
        <footer className={'site-footer'}>
            <div className={'footer-inner'}>
                <div>
                    <a className="brand" href="/">youyaku</a>
                    <a className={'download-pill'} href={customerAppUrl}>
                        Get the app
                        <QrCode size={14} />
                    </a>
                </div>
                <nav aria-label="About YouYaku">
                    <strong>About YouYaku</strong>
                    <a href="/articles">Careers</a>
                    <a href="/articles">Blog</a>
                    <a href="/search">Site map</a>
                </nav>
                <nav aria-label="For business">
                    <strong>For business</strong>
                    <a href={providerUrl}>For partners</a>
                    <a href={providerUrl}>Pricing</a>
                    <a href={providerUrl}>Support</a>
                </nav>
                <nav aria-label="Legal">
                    <strong>Legal</strong>
                    <a href="/privacy">Privacy policy</a>
                    <a href="/terms">Service terms</a>
                    <a href="/terms">Terms of use</a>
                </nav>
                <nav aria-label="Social media">
                    <strong>Find us</strong>
                    <a href="https://facebook.com">Facebook</a>
                    <a href="https://x.com">X</a>
                    <a href="https://instagram.com">Instagram</a>
                </nav>
            </div>
            <div className={'footer-bottom'}>
                <a href="/">English</a>
                <span>© 2026 YouYaku</span>
            </div>
        </footer>
    );
}

const heroFallbacks = [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=88',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1000&q=88',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1000&q=88',
    'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=1000&q=88',
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=1000&q=88',
];

function categoryIcon(slug) {
    return ({
        nail: Sparkles,
        wellness: ShieldCheck,
        beauty: Leaf,
        'hair-salon': Scissors,
    })[slug] || Store;
}

let freshTaxonomyRequest = null;

function requestFreshServiceTaxonomy() {
    if (!freshTaxonomyRequest) {
        freshTaxonomyRequest = fetch('/api/categories?hierarchy=1&per_page=100', {
            headers: { Accept: 'application/json' },
        })
            .then((response) => response.ok ? response.json() : null)
            .then((payload) => {
                const groups = buildServiceTaxonomy(payload?.data);

                return groups.length ? groups : fallbackServiceTaxonomy;
            })
            .catch(() => fallbackServiceTaxonomy);
    }

    return freshTaxonomyRequest;
}

function useFreshServiceTaxonomy() {
    const [taxonomy, setTaxonomy] = useState(fallbackServiceTaxonomy);

    useEffect(() => {
        let cancelled = false;

        requestFreshServiceTaxonomy().then((groups) => {
            if (!cancelled) setTaxonomy(groups);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    return taxonomy;
}

function subcategorySearchPath(category, subcategory) {
    const query = new URLSearchParams();

    query.set('service', subcategory.name);
    query.set('category', category.slug);
    query.set('subcategory', subcategory.slug);
    if (category.id) query.set('category_id', category.id);
    if (subcategory.id) query.set('subcategory_id', subcategory.id);

    return `/search?${query.toString()}`;
}

const categoryLinks = fallbackServiceTaxonomy.flatMap((group) => {
    const icon = categoryIcon(group.slug);
    return group.children.map((item) => ({ label: item.name, service: item.name, icon }));
});

const searchTimeOptions = ['Any time', 'Morning', 'Afternoon', 'Evening'];

function FreshPanelCalendar({ value, onSelect }) {
    const today = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }, []);
    const selected = parseInputDate(value);
    const initial = selected || today;
    const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
    const cells = useMemo(() => buildCalendarDays(view.year, view.month), [view]);
    const canGoPrev = view.year > today.getFullYear()
        || (view.year === today.getFullYear() && view.month > today.getMonth());

    function shiftMonth(step) {
        setView((current) => {
            const next = new Date(current.year, current.month + step, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
        });
    }

    return (
        <div className="fresh-panel-calendar">
            <div className="fresh-panel-calendar-head">
                <strong>{MONTH_LABELS[view.month]} {view.year}</strong>
                <div>
                    <button type="button" aria-label="Previous month" disabled={!canGoPrev} onClick={() => shiftMonth(-1)}>
                        <ChevronLeft size={17} />
                    </button>
                    <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
                        <ChevronRight size={17} />
                    </button>
                </div>
            </div>
            <div className="fresh-panel-calendar-weekdays">
                {DAY_LABELS.map((label) => <span key={label}>{label.slice(0, 1)}</span>)}
            </div>
            <div className="fresh-panel-calendar-grid">
                {cells.map((cell, index) => {
                    if (!cell) return <span className="empty" key={`empty-${index}`} />;

                    const inputValue = toInputValue(cell);
                    const isSelected = inputValue === value;
                    const isPast = cell < today;

                    return (
                        <button
                            className={cx(isSelected && 'selected')}
                            disabled={isPast}
                            key={inputValue}
                            type="button"
                            onClick={() => onSelect(inputValue)}
                        >
                            {cell.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

const businessFeatures = [
    { title: 'Kalender tim', text: 'Atur jadwal staf, cabang, dan durasi layanan dari satu layar.', icon: CalendarDays },
    { title: 'Katalog layanan', text: 'Tampilkan harga, foto, promo, add-on, dan kategori unggulan.', icon: Store },
    { title: 'Pengingat otomatis', text: 'Kurangi no-show dengan notifikasi jadwal dan status booking.', icon: Bell },
    { title: 'Profil pelanggan', text: 'Bangun relasi dari riwayat kunjungan dan preferensi customer.', icon: Users },
];

const pricingRows = [
    'Profil bisnis dan katalog layanan',
    'Online booking tanpa batas',
    'Kalender staf dan cabang',
    'Pengingat email dan notifikasi',
    'Promo, voucher, dan loyalty',
    'Laporan performa harian',
];

function freshFormatCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function freshFormatEnglishCount(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function AnimatedCount({ value, duration = 1300 }) {
    const initialValue = Number(value || 0);
    const [displayValue, setDisplayValue] = useState(initialValue);
    const displayRef = useRef(initialValue);

    useEffect(() => {
        const target = Number(value || 0);

        if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            displayRef.current = target;
            setDisplayValue(target);
            return undefined;
        }

        const startValue = displayRef.current;
        const startTime = performance.now();
        let frameId;

        function tick(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const nextValue = Math.round(startValue + (target - startValue) * eased);

            displayRef.current = nextValue;
            setDisplayValue(nextValue);

            if (progress < 1) {
                frameId = requestAnimationFrame(tick);
            }
        }

        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [duration, value]);

    return freshFormatEnglishCount(displayValue);
}

function freshFormatPrice(value) {
    const price = Number(value || 0);
    if (!price) return 'Harga tersedia';
    return `From IDR ${price.toLocaleString('en-US')}`;
}

function freshBranchLocation(branch) {
    return [branch?.city, branch?.state].filter(Boolean).join(', ') || 'Indonesia';
}

function branchCategory(branch) {
    const categories = Array.isArray(branch?.serviceCategories) ? branch.serviceCategories.filter(Boolean) : [];
    return categories.length ? categories.slice(0, 2).join(', ') : branch?.provider || 'Salon Kecantikan';
}

function distanceLabel(index) {
    const values = ['1.2 km', '2.4 km', '3.1 km', '650 m', '4.0 km', '1.8 km', '2.9 km', '3.7 km'];
    return values[index % values.length];
}

function buildSearchHref(service, location) {
    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (location) params.set('location', location);
    const query = params.toString();
    return query ? `/search?${query}` : '/search';
}

function buildSearchQuery({ service, location, date, time, coords, minPrice, maxPrice, minRating, sort } = {}) {
    const params = new URLSearchParams();
    const rawService = String(service || '').trim();
    const cleanService = ['all treatments', 'semua perawatan', 'semua treatment'].includes(rawService.toLowerCase()) ? '' : rawService;
    const cleanLocation = String(location || '').trim();
    const isCurrentLocation = ['current location', 'lokasi saat ini'].includes(cleanLocation.toLowerCase());
    const searchLocation = isCurrentLocation ? '' : cleanLocation;

    if (cleanService) params.set('service', cleanService);
    if (searchLocation) params.set('location', searchLocation);
    if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
    }
    if (date) params.set('date', date);
    if (time && time !== 'Any time') params.set('time', String(time).toLowerCase());
    if (Number(minPrice) > 0) params.set('min_price', String(Number(minPrice)));
    if (Number(maxPrice) > 0) params.set('max_price', String(Number(maxPrice)));
    if (Number(minRating) > 0) params.set('min_rating', String(Number(minRating)));
    if (sort && sort !== 'recommended') params.set('sort', sort);

    return {
        service: cleanService,
        location: searchLocation,
        coords: coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? coords : null,
        minPrice: Number(minPrice) > 0 ? Number(minPrice) : null,
        maxPrice: Number(maxPrice) > 0 ? Number(maxPrice) : null,
        minRating: Number(minRating) > 0 ? Number(minRating) : null,
        sort: sort || 'recommended',
        query: params.toString(),
    };
}

function buildSearchUrl(search) {
    return search.query ? `/search?${search.query}` : '/search';
}

const freshLoopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function freshLocalizeLoopbackUrl(url, hostname) {
    const normalized = String(url || '').replace(/\/$/, '');
    if (!hostname || freshLoopbackHosts.has(String(hostname).toLowerCase())) return normalized;

    try {
        const parsed = new URL(normalized);
        if (freshLoopbackHosts.has(parsed.hostname.toLowerCase())) {
            parsed.hostname = hostname;
        }
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return normalized;
    }
}

function freshUseLocalizedUrl(url) {
    const [resolved, setResolved] = useState(url);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setResolved(freshLocalizeLoopbackUrl(url, window.location.hostname));
        }
    }, [url]);

    return resolved;
}

function FreshCategoryTiles() {
    const taxonomy = useFreshServiceTaxonomy();

    return (
        <nav className="fresh-category-menu" aria-label="Browse service categories">
            <span className="fresh-category-menu-label">Browse by category</span>
            <div className="fresh-category-tile-list">
                {taxonomy.map((group, index) => {
                    const Icon = categoryIcon(group.slug);
                    const subcategoryCount = Array.isArray(group.children) ? group.children.length : 0;

                    return (
                        <Link
                            className={`fresh-category-tile tone-${(index % 4) + 1}`}
                            href={getCategoryPath(group)}
                            key={group.id || group.slug}
                        >
                            <span className="fresh-category-tile-icon" aria-hidden="true">
                                <Icon size={20} strokeWidth={1.9} />
                            </span>
                            <span className="fresh-category-tile-copy">
                                <strong>{group.name}</strong>
                                <small>{subcategoryCount} subcategories</small>
                            </span>
                            <ArrowRight className="fresh-category-tile-arrow" size={16} aria-hidden="true" />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

function FreshNavbarCategoryMenu({ open, taxonomy, activeCategorySlug, onSelectCategory, onClose }) {
    const activeCategory = taxonomy.find((group) => group.slug === activeCategorySlug) || null;
    const activeSubcategories = Array.isArray(activeCategory?.children) ? activeCategory.children : [];

    return (
        <AnimatePresence initial={false}>
            {open && (
                <>
                    <motion.button
                        className="fresh-nav-category-scrim"
                        type="button"
                        aria-label="Close category menu"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                    />
                    <motion.section
                        className="fresh-nav-category-panel"
                        id="fresh-nav-category-panel"
                        aria-label="Service categories"
                        initial={{ opacity: 0, x: '-50%', y: -12 }}
                        animate={{ opacity: 1, x: '-50%', y: 0 }}
                        exit={{ opacity: 0, x: '-50%', y: -8 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="fresh-nav-category-head">
                            <div>
                                <span>Browse by category</span>
                                <h2>What are you looking for?</h2>
                            </div>
                            <button type="button" aria-label="Close category menu" onClick={onClose}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="fresh-nav-category-grid">
                            {taxonomy.map((group, index) => {
                                const Icon = categoryIcon(group.slug);
                                const subcategoryCount = Array.isArray(group.children) ? group.children.length : 0;
                                const selected = group.slug === activeCategorySlug;

                                return (
                                    <button
                                        className={cx(`tone-${(index % 4) + 1}`, selected && 'is-active')}
                                        type="button"
                                        key={group.id || group.slug}
                                        aria-expanded={selected}
                                        aria-controls="fresh-nav-subcategory-panel"
                                        onClick={() => onSelectCategory(group.slug)}
                                    >
                                        <span className="fresh-nav-category-icon" aria-hidden="true">
                                            <Icon size={21} strokeWidth={1.9} />
                                        </span>
                                        <span className="fresh-nav-category-copy">
                                            <strong>{group.name}</strong>
                                            <small>{subcategoryCount} subcategories</small>
                                        </span>
                                        <ChevronRight className="fresh-nav-category-arrow" size={18} aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </div>

                        <AnimatePresence mode="wait" initial={false}>
                            {activeCategory && (
                                <motion.div
                                    className="fresh-nav-subcategory-panel"
                                    id="fresh-nav-subcategory-panel"
                                    key={activeCategory.slug}
                                    initial={{ opacity: 0, height: 0, y: -6 }}
                                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                >
                                    <div className="fresh-nav-subcategory-head">
                                        <div>
                                            <span>{activeCategory.name}</span>
                                            <strong>Choose a subcategory</strong>
                                        </div>
                                        <Link href={getCategoryPath(activeCategory)} onClick={onClose}>
                                            View all {activeCategory.name}
                                            <ArrowRight size={15} />
                                        </Link>
                                    </div>
                                    <div className="fresh-nav-subcategory-grid">
                                        {activeSubcategories.map((subcategory) => (
                                            <Link
                                                href={subcategorySearchPath(activeCategory, subcategory)}
                                                key={subcategory.id || subcategory.slug}
                                                onClick={onClose}
                                            >
                                                <span>{subcategory.name}</span>
                                                <ArrowRight size={15} aria-hidden="true" />
                                            </Link>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.section>
                </>
            )}
        </AnimatePresence>
    );
}

function FreshHeader({ onMenu, menuOpen, panelActive = menuOpen, onClose, session, sessionReady = true, searchSlot = null }) {
    // Session storage and the secure auth cookie are only available after hydration.
    // Until both have been checked, do not render the guest controls: doing so
    // made a logged-in customer briefly see the "Log in" navbar on refresh.
    const isSessionPending = !sessionReady;
    const isLoggedIn = Boolean(sessionReady && session?.loggedIn);
    const displayName = sessionDisplayName(session);
    const avatarUrl = session?.user?.photo;
    const [isScrolled, setIsScrolled] = useState(false);
    const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
    const [activeCategorySlug, setActiveCategorySlug] = useState('');
    const taxonomy = useFreshServiceTaxonomy();
    const [, , , activityCount] = useCustomerSessionState();

    const closeCategoryMenu = useCallback(() => {
        setCategoryMenuOpen(false);
        setActiveCategorySlug('');
    }, []);

    useEffect(() => {
        function updateScrollState() {
            setIsScrolled(window.scrollY > 12);
        }

        updateScrollState();
        window.addEventListener('scroll', updateScrollState, { passive: true });
        window.addEventListener('resize', updateScrollState);

        return () => {
            window.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
        };
    }, []);

    const handleMenuButtonClick = useCallback(() => {
        closeCategoryMenu();

        if (menuOpen) {
            onClose();
            return;
        }

        onMenu();
    }, [closeCategoryMenu, menuOpen, onClose, onMenu]);

    const handleCategoryButtonClick = useCallback(() => {
        if (categoryMenuOpen) {
            closeCategoryMenu();
            return;
        }

        if (menuOpen) onClose();
        setActiveCategorySlug('');
        setCategoryMenuOpen(true);
    }, [categoryMenuOpen, closeCategoryMenu, menuOpen, onClose]);

    const handleBrandClick = useCallback(() => {
        closeCategoryMenu();
        if (menuOpen) onClose();
    }, [closeCategoryMenu, menuOpen, onClose]);

    useEffect(() => {
        if (!categoryMenuOpen) return undefined;

        function closeWithEscape(event) {
            if (event.key === 'Escape') closeCategoryMenu();
        }

        document.addEventListener('keydown', closeWithEscape);
        return () => document.removeEventListener('keydown', closeWithEscape);
    }, [categoryMenuOpen, closeCategoryMenu]);

    return (
        <header className={cx('fresh-nav', searchSlot && 'search-nav', isScrolled && 'is-scrolled', (panelActive || categoryMenuOpen) && 'has-panel', categoryMenuOpen && 'has-category-panel')}>
            <div className="fresh-nav-inner">
                <div className="fresh-brand-cluster">
                    <Link className={cx('fresh-brand fresh-brand-center', searchSlot && 'search-nav-brand')} href="/" aria-label="YouYaku home" onClick={handleBrandClick}>
                        <span className="fresh-brand-name">YouYaku</span>
                    </Link>
                    <button
                        className={cx('fresh-category-trigger', categoryMenuOpen && 'is-active')}
                        type="button"
                        aria-expanded={categoryMenuOpen}
                        aria-controls="fresh-nav-category-panel"
                        onClick={handleCategoryButtonClick}
                    >
                        <Grid size={17} strokeWidth={2} aria-hidden="true" />
                        <span>Categories</span>
                        <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                </div>

                {searchSlot ? (
                    <div className="nav-search-slot search-nav-slot">{searchSlot}</div>
                ) : null}

                <div className={cx('fresh-nav-actions', searchSlot && 'search-nav-actions')}>
                    {!isSessionPending && (
                        <>
                            {!isLoggedIn ? (
                                <Link className="fresh-login-pill" href="/auth">Log in</Link>
                            ) : (
                                <>
                                    <Link className="fresh-nav-icon" href="/favorites" aria-label="Favorit">
                                        <Heart size={18} />
                                    </Link>
                                    <Link className="fresh-nav-icon fresh-activity-icon" href="/activity" aria-label="Activity">
                                        <ShoppingBag size={18} />
                                        {activityCount > 0 && <span>{activityCount}</span>}
                                    </Link>
                                </>
                            )}
                            <motion.button
                                className={cx('fresh-menu-btn', isLoggedIn && 'is-profile-menu')}
                                type="button"
                                onClick={handleMenuButtonClick}
                                aria-label={isLoggedIn ? 'Menu profil' : menuOpen ? 'Tutup menu' : 'Menu'}
                                aria-expanded={menuOpen}
                            >
                                {isLoggedIn ? (
                                    <span className="fresh-menu-profile" aria-hidden="true">
                                        <span className="fresh-menu-profile-avatar">
                                            {avatarUrl ? (
                                                <img src={avatarUrl} alt="" />
                                            ) : (
                                                <span>{sessionInitial(session)}</span>
                                            )}
                                        </span>
                                        <span className="fresh-menu-profile-copy">
                                            <span>Hello</span>
                                            <strong>{displayName}</strong>
                                        </span>
                                        <ChevronDown className={cx('fresh-menu-profile-chevron', menuOpen && 'is-open')} size={17} strokeWidth={2.4} />
                                    </span>
                                ) : (
                                    <motion.span
                                className="fresh-menu-icon-motion"
                                aria-hidden="true"
                                animate={{ rotate: 0 }}
                                transition={{ duration: 0 }}
                            >
                                <motion.span
                                    className="fresh-menu-line"
                                    animate={menuOpen ? { y: 0, rotate: 45 } : { y: -4, rotate: 0 }}
                                    transition={{ duration: 0.16, ease: 'easeOut' }}
                                />
                                <motion.span
                                    className="fresh-menu-line"
                                    animate={menuOpen ? { y: 0, rotate: -45 } : { y: 4, rotate: 0 }}
                                    transition={{ duration: 0.16, ease: 'easeOut' }}
                                />
                                    </motion.span>
                                )}
                            </motion.button>
                        </>
                    )}
                </div>
            </div>
            <FreshNavbarCategoryMenu
                open={categoryMenuOpen}
                taxonomy={taxonomy}
                activeCategorySlug={activeCategorySlug}
                onSelectCategory={setActiveCategorySlug}
                onClose={closeCategoryMenu}
            />
        </header>
    );
}

export function FreshSearchForm({
    locations = [],
    initialService = '',
    initialLocation = '',
    initialDate = '',
    initialTime = 'Any time',
    initialCoords = null,
    initialMinPrice = '',
    initialMaxPrice = '',
    initialMinRating = '',
    initialSort = 'recommended',
    showFilters = false,
    onSearchPayload,
}) {
    const router = useRouter();
    const formRef = useRef(null);
    const normalizedInitialTime = searchTimeOptions.find(
        (option) => option.toLowerCase() === String(initialTime || '').toLowerCase()
    ) || 'Any time';
    const [service, setService] = useState(initialService);
    const [location, setLocation] = useState(initialLocation);
    const [date, setDate] = useState(initialDate);
    const [time, setTime] = useState(normalizedInitialTime);
    const [locationCoords, setLocationCoords] = useState(initialCoords);
    const [minPrice, setMinPrice] = useState(initialMinPrice);
    const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
    const [minRating, setMinRating] = useState(initialMinRating);
    const [sort, setSort] = useState(initialSort || 'recommended');
    const [activeField, setActiveField] = useState('');
    const [locationSuggestions, setLocationSuggestions] = useState([]);
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState('');
    const locationSuggestController = useRef(null);

    useEffect(() => {
        const nextTime = searchTimeOptions.find(
            (option) => option.toLowerCase() === String(initialTime || '').toLowerCase()
        ) || 'Any time';

        setService(initialService);
        setLocation(initialLocation);
        setDate(initialDate);
        setTime(nextTime);
        setLocationCoords(initialLocation ? initialCoords : null);
        setMinPrice(initialMinPrice);
        setMaxPrice(initialMaxPrice);
        setMinRating(initialMinRating);
        setSort(initialSort || 'recommended');
    }, [initialService, initialLocation, initialDate, initialTime, initialCoords, initialMinPrice, initialMaxPrice, initialMinRating, initialSort]);

    const activeFilterCount = [
        Number(minPrice) > 0,
        Number(maxPrice) > 0,
        Number(minRating) > 0,
        sort && sort !== 'recommended',
    ].filter(Boolean).length;

    function highlightMatch(text) {
        const query = location.trim();
        if (!query) return text;

        const source = String(text || '');
        const index = source.toLowerCase().indexOf(query.toLowerCase());
        if (index < 0) return source;

        return (
            <>
                {source.slice(0, index)}
                <mark>{source.slice(index, index + query.length)}</mark>
                {source.slice(index + query.length)}
            </>
        );
    }

    useEffect(() => {
        function handlePointerDown(event) {
            if (!formRef.current?.contains(event.target)) {
                setActiveField('');
            }
        }

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, []);

    useEffect(() => {
        const query = location.trim();

        if (locationSuggestController.current) {
            locationSuggestController.current.abort();
            locationSuggestController.current = null;
        }

        if (activeField !== 'location' || query.length < 3 || query === 'Current location') {
            setLocationSuggestions([]);
            setLocationLoading(false);
            setLocationError('');
            return undefined;
        }

        const controller = new AbortController();
        locationSuggestController.current = controller;
        setLocationLoading(true);
        setLocationError('');

        const timer = window.setTimeout(async () => {
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=id&countrycodes=id&q=${encodeURIComponent(query)}`,
                    { headers: { Accept: 'application/json' }, signal: controller.signal }
                );

                if (!response.ok) {
                    throw new Error(`Location search failed: ${response.status}`);
                }

                const data = await response.json();
                setLocationSuggestions(Array.isArray(data) ? data : []);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setLocationError('Address not found.');
                    setLocationSuggestions([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLocationLoading(false);
                }
            }
        }, 300);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [activeField, location]);

    function displayDate() {
        if (!date && time === 'Any time') return '';
        const dateLabel = date
            ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T00:00:00`))
            : 'Any date';

        return time === 'Any time' ? dateLabel : `${dateLabel}, ${time}`;
    }

    function submitSearch(event) {
        event.preventDefault();
        const search = buildSearchQuery({
            service,
            location,
            date,
            time,
            coords: locationCoords,
            minPrice,
            maxPrice,
            minRating,
            sort,
        });

        if (onSearchPayload) {
            onSearchPayload({
                service: search.service,
                location: search.location,
                date,
                time,
                coords: search.coords,
                minPrice: search.minPrice,
                maxPrice: search.maxPrice,
                minRating: search.minRating,
                sort: search.sort,
                query: search.query,
            });
            return;
        }

        router.push(buildSearchUrl(search));
    }

    function chooseCurrentLocation() {
        setLocation('Current location');
        setActiveField('');

        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition((position) => {
            setLocationCoords({
                lat: Number(position.coords.latitude.toFixed(6)),
                lng: Number(position.coords.longitude.toFixed(6)),
            });
        });
    }

    return (
        <form className={cx('fresh-search', showFilters && 'has-filters')} onSubmit={submitSearch} ref={formRef}>
            <label className={cx('fresh-search-field', activeField === 'service' && 'active')} onClick={() => setActiveField('service')}>
                <Search size={18} />
                <span>Service or salon</span>
                <input
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    onFocus={() => setActiveField('service')}
                    placeholder="All treatments"
                />
            </label>
            <label className={cx('fresh-search-field fresh-location-field', location && 'has-value', activeField === 'location' && 'active')} onClick={() => setActiveField('location')}>
                <MapPin size={18} />
                <span>Location</span>
                <input
                    value={location}
                    onChange={(event) => {
                        setLocation(event.target.value);
                        setLocationCoords(null);
                    }}
                    onFocus={() => setActiveField('location')}
                    placeholder="Current location"
                />
            </label>
            <label className={cx('fresh-search-field fresh-date-field', activeField === 'date' && 'active')} onClick={() => setActiveField('date')}>
                <CalendarDays size={18} />
                <span>Date</span>
                <input
                    value={displayDate()}
                    readOnly
                    onFocus={() => setActiveField('date')}
                    placeholder="Any time"
                    type="text"
                />
            </label>
            {showFilters && (
                <button
                    className={cx('fresh-filter-button', activeField === 'filters' && 'active', activeFilterCount > 0 && 'has-value')}
                    type="button"
                    aria-label="Search filters"
                    aria-expanded={activeField === 'filters'}
                    onClick={() => setActiveField((field) => field === 'filters' ? '' : 'filters')}
                >
                    <SlidersHorizontal size={17} />
                    <span>Filters</span>
                    {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
                </button>
            )}
            <button className="fresh-search-button" type="submit">
                Search
                <ArrowRight size={17} />
            </button>

            {activeField === 'service' && (
                <div className="fresh-search-panel service" role="dialog" aria-label="Choose a treatment">
                    <button type="button" className="fresh-panel-option strong" onClick={() => { setService(''); setActiveField(''); }}>
                        <Search size={17} />
                        <span>All treatments</span>
                    </button>
                    {categoryLinks.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button type="button" className="fresh-panel-option" key={item.service} onClick={() => { setService(item.service); setActiveField(''); }}>
                                <Icon size={17} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {activeField === 'location' && (
                <div className="fresh-search-panel location" role="dialog" aria-label="Choose a location">
                    {!location.trim() && (
                        <button type="button" className="fresh-location-result" onClick={chooseCurrentLocation}>
                            <span className="fresh-location-pin"><LocateFixed size={18} /></span>
                            <span>
                                <strong>Current location</strong>
                                <small>Use your device location</small>
                            </span>
                        </button>
                    )}
                    {locationLoading && (
                        <span className="fresh-panel-empty">Searching locations...</span>
                    )}
                    {locationSuggestions.map((item) => {
                        const displayName = item.display_name || '';
                        const parts = displayName.split(',').map((part) => part.trim()).filter(Boolean);
                        const label = parts.slice(0, 1).join(', ') || item.name || location;
                        const detail = parts.slice(1, 4).join(', ') || displayName;

                        return (
                        <button
                            type="button"
                            className="fresh-location-result"
                            key={item.place_id || displayName}
                            onClick={() => {
                                setLocation(parts.slice(0, 3).join(', ') || displayName);
                                setLocationCoords({
                                    lat: Number(Number(item.lat).toFixed(6)),
                                    lng: Number(Number(item.lon).toFixed(6)),
                                });
                                setActiveField('');
                            }}
                        >
                            <span className="fresh-location-pin"><MapPin size={18} /></span>
                            <span>
                                <strong>{highlightMatch(label)}</strong>
                                <small>{highlightMatch(detail)}</small>
                            </span>
                        </button>
                        );
                    })}
                    {location.trim().length >= 3 && !locationLoading && !locationSuggestions.length && (
                        <span className="fresh-panel-empty">{locationError || 'Address not found.'}</span>
                    )}
                </div>
            )}

            {activeField === 'date' && (
                <div className="fresh-search-panel date" role="dialog" aria-label="Choose date and time">
                    <FreshPanelCalendar value={date} onSelect={setDate} />
                    <div className="fresh-panel-time-card">
                        <span>Time</span>
                        <div className="fresh-panel-times">
                            {searchTimeOptions.map((option) => (
                                <button type="button" className={cx(time === option && 'active')} key={option} onClick={() => setTime(option)}>
                                    {option}
                                </button>
                            ))}
                        </div>
                        <button type="button" className="fresh-panel-apply" onClick={() => setActiveField('')}>
                            Apply
                        </button>
                    </div>
                </div>
            )}

            {showFilters && activeField === 'filters' && (
                <div className="fresh-search-panel filters" role="dialog" aria-label="Search filters">
                    <div className="fresh-filter-panel-heading">
                        <div>
                            <strong>Filter salons</strong>
                            <small>Narrow results by price and rating.</small>
                        </div>
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMinPrice('');
                                    setMaxPrice('');
                                    setMinRating('');
                                    setSort('recommended');
                                }}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                    <div className="fresh-filter-price-row">
                        <label>
                            <span>Minimum price</span>
                            <input type="number" min="0" step="10000" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="IDR 0" />
                        </label>
                        <label>
                            <span>Maximum price</span>
                            <input type="number" min="0" step="10000" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="No limit" />
                        </label>
                    </div>
                    <label className="fresh-filter-select">
                        <span>Minimum rating</span>
                        <select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                            <option value="">Any rating</option>
                            <option value="3">3.0 and above</option>
                            <option value="4">4.0 and above</option>
                            <option value="4.5">4.5 and above</option>
                        </select>
                    </label>
                    <label className="fresh-filter-select">
                        <span>Sort by</span>
                        <select value={sort} onChange={(event) => setSort(event.target.value)}>
                            <option value="recommended">Recommended</option>
                            <option value="rating_desc">Highest rating</option>
                            <option value="price_asc">Lowest price</option>
                            <option value="price_desc">Highest price</option>
                            <option value="name_asc">Salon name</option>
                        </select>
                    </label>
                    <button type="submit" className="fresh-filter-apply">Apply filters</button>
                </div>
            )}

        </form>
    );
}

function Hero({ branches, locations, todayAppointmentCount, customerAppUrl }) {
    const heroImages = [
        branches[0]?.image || heroFallbacks[0],
        branches[1]?.image || heroFallbacks[1],
        branches[2]?.image || heroFallbacks[2],
        branches[3]?.image || heroFallbacks[3],
        branches[4]?.image || heroFallbacks[4],
    ];
    const heroSlides = useMemo(() => ([
        {
            title: 'Are you ready to',
            emphasis: 'lead the way',
            subtitle: 'Luxury meets effortless salon booking comfort',
            cta: 'Discover',
            href: '/search',
            image: heroImages[0],
            tone: 'gold',
        },
        {
            title: 'Find your next',
            emphasis: 'salon moment',
            subtitle: 'Compare nearby studios, prices, and trusted customer reviews',
            cta: 'Explore',
            href: '/search',
            image: heroImages[1],
            tone: 'mint',
        },
        {
            title: 'Book beauty',
            emphasis: 'without waiting',
            subtitle: 'Pick a service, location, and date in one calm booking flow',
            cta: 'Book now',
            href: '/search',
            image: heroImages[2],
            tone: 'peach',
        },
        {
            title: 'Compare salons',
            emphasis: 'with confidence',
            subtitle: 'See ratings, photos, prices, and distance before deciding',
            cta: 'Compare',
            href: '/search',
            image: heroImages[3],
            tone: 'sky',
        },
        {
            title: 'Save your',
            emphasis: 'favorite places',
            subtitle: 'Keep trusted salons nearby for your next regular treatment',
            cta: 'Save now',
            href: '/favorites',
            image: heroImages[4],
            tone: 'rose',
        },
    ]), [heroImages[0], heroImages[1], heroImages[2], heroImages[3], heroImages[4]]);
    const [activeSlide, setActiveSlide] = useState(0);
    const [slideDirection, setSlideDirection] = useState(1);
    const [autoplayCycle, setAutoplayCycle] = useState(0);
    const swipeStartRef = useRef(null);
    const suppressSwipeClickRef = useRef(false);
    const wheelDistanceRef = useRef(0);
    const wheelLockedRef = useRef(false);
    const wheelUnlockTimerRef = useRef(null);

    const goToSlide = useCallback((nextIndex) => {
        setActiveSlide((current) => {
            const total = heroSlides.length;
            const rawNext = typeof nextIndex === 'function' ? nextIndex(current) : nextIndex;
            const normalizedNext = (rawNext + total) % total;
            let direction = normalizedNext > current ? 1 : -1;

            if (current === total - 1 && normalizedNext === 0) direction = 1;
            if (current === 0 && normalizedNext === total - 1) direction = -1;

            if (normalizedNext !== current) {
                setSlideDirection(direction);
            }

            return normalizedNext;
        });
    }, [heroSlides.length]);

    // Advance the showcase every six seconds. A manual interaction resets the
    // countdown, so the next automatic movement never immediately overrides a
    // slide the customer has just chosen.
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return undefined;
        }

        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                goToSlide((current) => current + 1);
            }
        }, 6000);

        return () => window.clearInterval(interval);
    }, [autoplayCycle, goToSlide]);

    const goToManualSlide = useCallback((nextIndex) => {
        setAutoplayCycle((cycle) => cycle + 1);
        goToSlide(nextIndex);
    }, [goToSlide]);

    const startSwipe = useCallback((event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        swipeStartRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, []);

    const finishSwipe = useCallback((event) => {
        const start = swipeStartRef.current;
        swipeStartRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!start) return;

        const horizontalDistance = event.clientX - start.x;
        const verticalDistance = event.clientY - start.y;
        const isHorizontalSwipe = Math.abs(horizontalDistance) >= 52
            && Math.abs(horizontalDistance) > Math.abs(verticalDistance);

        if (!isHorizontalSwipe) return;

        // Do not follow a card/CTA link after a deliberate swipe gesture.
        suppressSwipeClickRef.current = true;
        window.setTimeout(() => {
            suppressSwipeClickRef.current = false;
        }, 0);

        goToManualSlide(horizontalDistance < 0 ? activeSlide + 1 : activeSlide - 1);
    }, [activeSlide, goToManualSlide]);

    const handleTrackpadSwipe = useCallback((event) => {
        // A two-finger horizontal gesture on a desktop trackpad is emitted as a
        // wheel event with deltaX rather than as a mouse drag.
        const horizontalDistance = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
            ? event.deltaX
            : event.shiftKey ? event.deltaY : 0;

        if (!horizontalDistance || wheelLockedRef.current) return;

        event.preventDefault();
        wheelDistanceRef.current += horizontalDistance;

        if (Math.abs(wheelDistanceRef.current) < 42) return;

        const direction = wheelDistanceRef.current > 0 ? 1 : -1;
        wheelDistanceRef.current = 0;
        wheelLockedRef.current = true;
        goToManualSlide(activeSlide + direction);

        window.clearTimeout(wheelUnlockTimerRef.current);
        wheelUnlockTimerRef.current = window.setTimeout(() => {
            wheelLockedRef.current = false;
        }, 520);
    }, [activeSlide, goToManualSlide]);

    useEffect(() => () => window.clearTimeout(wheelUnlockTimerRef.current), []);

    function slideOffset(index) {
        const total = heroSlides.length;
        let offset = index - activeSlide;

        if (offset > total / 2) offset -= total;
        if (offset < -total / 2) offset += total;

        return offset;
    }

    return (
        <section className="fresh-hero fresh-studio-hero">
            <button className="fresh-hero-arrow left" type="button" aria-label="Sebelumnya" onClick={() => goToManualSlide(activeSlide - 1)}>
                <ChevronLeft size={22} />
            </button>

            <div
                className="fresh-showcase-stage"
                onPointerDown={startSwipe}
                onPointerUp={finishSwipe}
                onPointerCancel={() => { swipeStartRef.current = null; }}
                onDragStart={(event) => event.preventDefault()}
                onWheel={handleTrackpadSwipe}
                onClickCapture={(event) => {
                    if (suppressSwipeClickRef.current) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                {heroSlides.map((slide, index) => {
                    const offset = slideOffset(index);
                    const isActive = offset === 0;
                    const isEntering = index === activeSlide;

                    return (
                        <motion.div
                            className={`fresh-showcase tone-${slide.tone}`}
                            key={slide.image}
                            aria-hidden={!isActive}
                            animate={{
                                x: `${offset * 102.5}%`,
                                scale: 1,
                                opacity: Math.abs(offset) > 1 ? 0 : 1,
                                rotate: 0,
                            }}
                            initial={false}
                            transition={{
                                opacity: { duration: 0.18 },
                                x: {
                                    type: 'spring',
                                    stiffness: 210,
                                    damping: 28,
                                    mass: 0.9,
                                },
                                scale: {
                                    type: 'spring',
                                    stiffness: 240,
                                    damping: 30,
                                    mass: 0.8,
                                },
                                rotate: {
                                    type: 'spring',
                                    stiffness: 220,
                                    damping: 28,
                                },
                            }}
                            style={{
                                pointerEvents: isActive ? 'auto' : 'none',
                                zIndex: isActive ? 4 : isEntering ? 3 : 1,
                                transformOrigin: slideDirection > 0 ? 'left center' : 'right center',
                            }}
                        >
                            <motion.div
                                className="fresh-showcase-copy"
                                animate={{ opacity: isActive ? 1 : 0.55, y: isActive ? 0 : 6 }}
                                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <h1>{slide.title} <strong>{slide.emphasis}</strong></h1>
                                <p>{slide.subtitle}</p>
                                <a className="fresh-discover-button" href={slide.href}>
                                    {slide.cta}
                                    <ArrowRight size={17} />
                                </a>
                            </motion.div>

                            <div className="fresh-showcase-media">
                                <img className="fresh-showcase-main" src={slide.image} alt="YouYaku salon booking showcase" draggable="false" />
                                <div className="fresh-showcase-bubble one" />
                                <div className="fresh-showcase-bubble two" />
                            </div>

                        </motion.div>
                    );
                })}
            </div>

            <div className="fresh-showcase-lines" aria-hidden="true">
                {heroSlides.map((lineSlide, lineIndex) => (
                    <span className={lineIndex === activeSlide ? 'active' : ''} key={lineSlide.image} />
                ))}
            </div>

            <button className="fresh-hero-arrow right" type="button" aria-label="Berikutnya" onClick={() => goToManualSlide(activeSlide + 1)}>
                <ChevronRight size={22} />
            </button>

            <div className="fresh-hero-meta-row">
                <FreshSearchForm locations={locations} />
                <div className="fresh-today-bookings" aria-label={`${freshFormatEnglishCount(todayAppointmentCount)} appointments booked today`}>
                    <strong><AnimatedCount value={todayAppointmentCount} /></strong>
                    <span>appointments booked today</span>
                </div>
                <FreshCategoryTiles />
            </div>
        </section>
    );
}

function VenueCard({ branch, index, badge }) {
    const tag = badge || branch?.tag || (index % 3 === 1 ? 'Baru' : index % 3 === 2 ? 'Tren' : 'Unggulan');
    const rating = Number(branch?.rating || 0);
    const hasReviews = Number(branch?.reviews || 0) > 0 && rating > 0;

    return (
        <a className="fresh-venue-card" href={getSalonPath(branch)}>
            <div className="fresh-venue-image">
                <img src={branch.image} alt={branch.name} loading="lazy" decoding="async" />
                <span className={cx('fresh-badge', tag === 'Baru' && 'new')}>{tag}</span>
                <button className="fresh-heart" type="button" aria-label={`Save ${branch.name}`} onClick={(event) => event.preventDefault()}>
                    <Heart size={16} />
                </button>
            </div>
            <div className="fresh-venue-body">
                <div className="fresh-venue-title">
                    <h3>{branch.name}</h3>
                    <span>
                        {hasReviews ? (
                            <>
                                <Star size={13} fill="currentColor" strokeWidth={0} />
                                {rating.toFixed(1)}
                            </>
                        ) : 'New'}
                    </span>
                </div>
                <p>{freshBranchLocation(branch)} - {distanceLabel(index)}</p>
            </div>
        </a>
    );
}

function dateScore(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function pickVenueItems(branches, sorter, size = 8) {
    return [...branches]
        .sort(sorter)
        .slice(0, size);
}

function VenueCarouselBlock({ title, items, badge, showLink = false, linkLabel = 'Lihat semua', startIndex = 0 }) {
    const carouselRef = useRef(null);
    const [canScrollBack, setCanScrollBack] = useState(false);
    const [canScrollForward, setCanScrollForward] = useState(false);

    const updateScrollState = useCallback(() => {
        const carousel = carouselRef.current;
        if (!carousel) return;
        setCanScrollBack(carousel.scrollLeft > 8);
        setCanScrollForward(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 8);
    }, []);

    useEffect(() => {
        const carousel = carouselRef.current;
        if (!carousel) return undefined;

        updateScrollState();
        carousel.addEventListener('scroll', updateScrollState, { passive: true });
        window.addEventListener('resize', updateScrollState);

        return () => {
            carousel.removeEventListener('scroll', updateScrollState);
            window.removeEventListener('resize', updateScrollState);
        };
    }, [items.length, updateScrollState]);

    function scrollBack() {
        carouselRef.current?.scrollBy({
            left: -carouselRef.current.clientWidth,
            behavior: 'smooth',
        });
    }

    function scrollForward() {
        carouselRef.current?.scrollBy({
            left: carouselRef.current.clientWidth,
            behavior: 'smooth',
        });
    }

    return (
        <div className="fresh-venue-section">
            <div className="fresh-section-head">
                <div>
                    <h2>{title}</h2>
                </div>
                {showLink && (
                    <a href="/search" className="fresh-section-link">
                        {linkLabel}
                        <ArrowRight size={16} />
                    </a>
                )}
            </div>
            <div className="fresh-venue-carousel-wrap">
                {canScrollBack && (
                    <button className="fresh-venue-scroll back" type="button" aria-label={`Geser ${title} ke awal`} onClick={scrollBack}>
                        <ChevronLeft size={22} />
                    </button>
                )}
                {canScrollBack && canScrollForward && (
                    <button className="fresh-venue-scroll forward" type="button" aria-label={`Geser ${title} ke kanan`} onClick={scrollForward}>
                        <ChevronRight size={22} />
                    </button>
                )}
                <div className="fresh-venue-carousel" ref={carouselRef}>
                    {items.map((branch, index) => (
                        <VenueCard
                            branch={branch}
                            index={startIndex + index}
                            badge={badge}
                            key={`${title}-${branch.id}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function VenuesSection({ branches, totalBranches = branches.length }) {
    const recommendedItems = pickVenueItems(branches, (a, b) => (
        (Number(b.rating || 0) * 100 + Number(b.reviews || 0) + Number(b.servicesCount || 0))
        - (Number(a.rating || 0) * 100 + Number(a.reviews || 0) + Number(a.servicesCount || 0))
    ));
    const newItems = pickVenueItems(branches, (a, b) => (
        dateScore(b.createdAt) - dateScore(a.createdAt)
    ));
    const trendingItems = pickVenueItems(branches, (a, b) => (
        (Number(b.reviews || 0) * 2 + Number(b.servicesCount || 0) + Number(b.staffCount || 0) + Number(b.rating || 0) * 10)
        - (Number(a.reviews || 0) * 2 + Number(a.servicesCount || 0) + Number(a.staffCount || 0) + Number(a.rating || 0) * 10)
    ));

    return (
        <section className="fresh-section fresh-venues" id="venues">
            <VenueCarouselBlock
                title="Recommended for you"
                items={recommendedItems}
                showLink
                linkLabel={`Lihat semua ${freshFormatCount(totalBranches)} salon`}
            />
            <VenueCarouselBlock title="New to YouYaku" items={newItems} badge="Baru" startIndex={4} />
            <VenueCarouselBlock title="Trendings" items={trendingItems} badge="Tren" startIndex={2} />
        </section>
    );
}

function MarketplacePreview({ branches }) {
    const previewItems = branches.slice(0, 4);
    const [activeIndex, setActiveIndex] = useState(0);
    const normalizedActiveIndex = Math.min(activeIndex, Math.max(0, previewItems.length - 1));
    const active = previewItems[normalizedActiveIndex] || branches[0];
    const displayedPreviewItems = useMemo(() => {
        if (!active?.id) return previewItems;

        return [...previewItems].sort((first, second) => {
            if (first.id === active.id) return -1;
            if (second.id === active.id) return 1;
            return 0;
        });
    }, [previewItems, active?.id]);

    useEffect(() => {
        if (previewItems.length < 2) return undefined;

        const interval = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % previewItems.length);
        }, 6800);

        return () => window.clearInterval(interval);
    }, [previewItems.length]);

    function selectPreviewBranch(branch) {
        const index = previewItems.findIndex((item) => item.id === branch.id);
        if (index >= 0) setActiveIndex(index);
    }

    return (
        <section className="fresh-market-band">
            <div className="fresh-market-copy">
                <span className="fresh-section-eyebrow">Salon discovery</span>
                <h2>Find the right salon near you</h2>
                <p>
                    Compare local salons by location, ratings, services, and price range.
                    Choose a time that works for you, then complete your booking in one simple, secure flow.
                </p>
                <a className="fresh-primary-button" href="/search">
                    Explore salons
                    <ArrowRight size={17} />
                </a>
            </div>
            <div className="fresh-market-ui" aria-label="Simulasi pencarian salon">
                <div className="fresh-market-list">
                    {displayedPreviewItems.map((branch) => {
                        const mapIndex = previewItems.findIndex((item) => item.id === branch.id);
                        const isActive = branch.id === active?.id;

                        return (
                        <motion.button
                            layout
                            className={cx('fresh-mini-result', isActive && 'active')}
                            key={branch.id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => setActiveIndex(mapIndex)}
                            transition={{ layout: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }}
                        >
                            <img src={branch.image} alt="" />
                            <div>
                                <b>{branch.name}</b>
                                <span>{freshBranchLocation(branch)}</span>
                                <small>{distanceLabel(mapIndex)}</small>
                            </div>
                            <strong>{Number(branch.rating || 5).toFixed(1)}</strong>
                        </motion.button>
                        );
                    })}
                </div>
                <div className="fresh-market-map">
                    <SalonMap
                        branches={previewItems}
                        focusBranches={previewItems}
                        activeId={active?.id || null}
                        demoActiveId={active?.id || null}
                        onToggleExpand={() => {}}
                        onHoverBranch={selectPreviewBranch}
                        onSelectBranch={selectPreviewBranch}
                    />
                    <motion.div
                        className="fresh-market-map-card"
                        key={active?.id || 'fallback'}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <img src={active?.image || heroFallbacks[0]} alt="" />
                        <div>
                            <b>{active?.name || 'Glow Hair Studio'}</b>
                            <span>{active ? freshBranchLocation(active) : 'Jakarta Selatan'}</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

function AppSection({ branches, customerAppUrl }) {
    const first = branches[0];
    const second = branches[1] || branches[0];

    return (
        <section className="fresh-section fresh-app-section" id="app">
            <div className="fresh-app-copy">
                <span className="fresh-section-eyebrow">Download the app</span>
                <h2>Book beauty and wellness from your pocket</h2>
                <p>
                    Save your favourites, review upcoming appointments, and receive booking reminders directly in the YouYaku app.
                </p>
                <div className="fresh-app-actions">
                    <a className="fresh-store-button" href={customerAppUrl} aria-label="Download on the App Store">
                        <span className="fresh-apple-store-mark" aria-hidden="true">ï£¿</span>
                        <span className="fresh-store-copy">
                            <small>Download on the</small>
                            <strong>App Store</strong>
                        </span>
                    </a>
                    <a className="fresh-store-button" href={customerAppUrl} aria-label="Get it on Google Play">
                        <GooglePlayMark />
                        <span className="fresh-store-copy">
                            <small>Get it on</small>
                            <strong>Google Play</strong>
                        </span>
                    </a>
                    <a className="fresh-qr-button" href={customerAppUrl} aria-label="Scan to download the app">
                        <QrCode size={58} />
                    </a>
                </div>
            </div>

            <div className="fresh-phone-stage" aria-hidden="true">
                <div className="fresh-phone primary">
                    <div className="fresh-phone-bar" />
                    <header>
                        <span>11:00</span>
                        <b>YouYaku</b>
                    </header>
                    <div className="fresh-phone-search">
                        <Search size={13} />
                        <span>Search salons</span>
                    </div>
                    <article>
                        <img src={first?.image || heroFallbacks[0]} alt="" />
                        <div>
                            <b>{first?.name || 'Glow Hair Studio'}</b>
                            <span>{first ? branchCategory(first) : 'Hair Salon'}</span>
                            <button type="button">Book now</button>
                        </div>
                    </article>
                </div>
                <div className="fresh-phone secondary">
                    <div className="fresh-phone-bar" />
                    <div className="fresh-phone-map">
                        <span />
                        <span />
                        <span />
                    </div>
                    <article>
                        <img src={second?.image || heroFallbacks[1]} alt="" />
                        <div>
                            <b>{second?.name || 'Luna Nails'}</b>
                            <span>{second ? freshBranchLocation(second) : 'Jakarta Barat'}</span>
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
}

function ReviewsSection({ reviews = [], summary = {} }) {
    const reviewTotal = Number(summary.reviewTotal || 0);
    const averageRating = Number(summary.averageRating || 0);

    return (
        <section className="fresh-section" id="reviews">
            <div className="fresh-section-head">
                <div>
                    <span className="fresh-section-eyebrow">Reviews</span>
                    <h2>Loved by local self-care customers</h2>
                    <p>
                        {reviewTotal > 0
                            ? `${averageRating.toFixed(1)} average from ${freshFormatCount(reviewTotal)} verified salon reviews`
                            : 'Verified customer reviews will appear here after completed appointments.'}
                    </p>
                </div>
            </div>
            {reviews.length ? (
                <div className="fresh-review-grid">
                    {reviews.map((review) => (
                        <article className="fresh-review-card" key={review.id}>
                            <div className="fresh-stars" aria-label={`Rating ${review.rating} of 5`}>
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <Star
                                        size={15}
                                        fill={index < Math.round(review.rating) ? 'currentColor' : 'none'}
                                        strokeWidth={index < Math.round(review.rating) ? 0 : 1.8}
                                        key={index}
                                    />
                                ))}
                            </div>
                            <h3>{review.branchName}</h3>
                            <p>{review.text || 'Verified customer review.'}</p>
                            <footer>
                                <span>{review.initials}</span>
                                <div>
                                    <b>{review.name}</b>
                                    <small>{review.location}</small>
                                </div>
                            </footer>
                        </article>
                    ))}
                </div>
            ) : (
                <p className="fresh-review-empty">No verified salon reviews are available yet.</p>
            )}
        </section>
    );
}

function StatsSection({ branchTotal, locationTotal, serviceTotal, appointmentCount }) {
    const stats = [
        { value: `${freshFormatCount(Math.max(appointmentCount, 250000))}+`, label: 'reservasi diproses' },
        { value: freshFormatCount(branchTotal), label: 'cabang tersedia' },
        { value: freshFormatCount(locationTotal), label: 'kota aktif' },
        { value: freshFormatCount(serviceTotal), label: 'layanan tersedia' },
    ];

    return (
        <section className="fresh-stats-band">
            <div className="fresh-stats-copy">
                <span className="fresh-section-eyebrow">Self-care destination</span>
                <h2>The top-rated destination for local beauty bookings</h2>
                <p>Satu marketplace untuk menemukan layanan, memilih jadwal, dan menyimpan riwayat reservasi.</p>
            </div>
            <div className="fresh-stat-grid">
                {stats.map((stat) => (
                    <article key={stat.label}>
                        <strong>{stat.value}</strong>
                        <span>{stat.label}</span>
                    </article>
                ))}
            </div>
        </section>
    );
}

function FreshBusinessSection({ providerUrl }) {
    return (
        <section className="fresh-section fresh-business-section" id="business">
            <div className="fresh-business-copy">
                <span className="fresh-section-eyebrow">For business</span>
                <h2>Run your salon with a calmer booking system</h2>
                <p>
                    Kelola kalender, layanan, cabang, staf, pelanggan, dan promo dari dashboard yang dibuat untuk operasional salon.
                </p>
                <a className="fresh-primary-button" href={providerUrl}>
                    Find out more
                    <ArrowRight size={17} />
                </a>
            </div>

            <div className="fresh-dashboard" aria-hidden="true">
                <aside>
                    {['Calendar', 'Bookings', 'Clients', 'Services', 'Reports'].map((item, index) => (
                        <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>
                    ))}
                </aside>
                <main>
                    <header>
                        <div>
                            <b>Today</b>
                            <span>24 appointments</span>
                        </div>
                        <strong>Rp18.4jt</strong>
                    </header>
                    <div className="fresh-dashboard-slots">
                        <span className="done">09:00 Haircut</span>
                        <span className="active">11:30 Facial</span>
                        <span>14:00 Nail art</span>
                        <span>16:30 Spa</span>
                    </div>
                    <div className="fresh-dashboard-chart">
                        <i style={{ height: '42%' }} />
                        <i style={{ height: '68%' }} />
                        <i style={{ height: '56%' }} />
                        <i style={{ height: '82%' }} />
                        <i style={{ height: '62%' }} />
                        <i style={{ height: '90%' }} />
                    </div>
                </main>
            </div>

            <div className="fresh-business-feature-grid">
                {businessFeatures.map((feature) => {
                    const Icon = feature.icon;
                    return (
                        <article key={feature.title}>
                            <Icon size={20} />
                            <b>{feature.title}</b>
                            <p>{feature.text}</p>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function PricingSection({ providerUrl }) {
    return (
        <section className="fresh-section fresh-pricing-section" id="pricing">
            <div className="fresh-section-head">
                <div>
                    <span className="fresh-section-eyebrow">Pricing</span>
                    <h2>Software that grows with your business</h2>
                </div>
                <a className="fresh-section-link" href={providerUrl}>
                    Register as a partner
                    <ArrowRight size={16} />
                </a>
            </div>

            <div className="fresh-pricing-grid">
                <article className="fresh-plan-card">
                    <span>Independent</span>
                    <h3>Solo professional</h3>
                    <strong>Free</strong>
                    <p>For independent stylists, barbers, nail artists, and therapists.</p>
                    <a href={providerUrl}>Mulai sekarang</a>
                </article>
                <article className="fresh-plan-card featured">
                    <span>Team</span>
                    <h3>Salon and spa teams</h3>
                    <strong>Flexible</strong>
                    <p>For businesses with multiple staff members, branches, and operating schedules.</p>
                    <a href={providerUrl}>Lihat opsi tim</a>
                </article>
                <div className="fresh-plan-table">
                    {pricingRows.map((row, index) => (
                        <div key={row}>
                            <span>{row}</span>
                            <Check size={17} className="included" />
                            {index < 2 ? <Check size={17} className="included" /> : <Check size={17} className="included muted" />}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function BrowseSection({ locations }) {
    const taxonomy = useFreshServiceTaxonomy();
    const cityItems = (locations.length ? locations : [
        { city: 'Jakarta Selatan' },
        { city: 'Bandung' },
        { city: 'Surabaya' },
        { city: 'Denpasar' },
    ]).slice(0, 10);

    return (
        <section className="fresh-section fresh-browse-section" id="browse">
            <div className="fresh-section-head">
                <div>
                    <span className="fresh-section-eyebrow">Browse by city</span>
                    <h2>Find top services near you</h2>
                </div>
            </div>
            <div className="fresh-city-track">
                {cityItems.map((location, index) => (
                    <a
                        href={buildSearchHref('', location.city)}
                        className={index === 0 ? 'active' : ''}
                        key={`${location.city}-${index}`}
                    >
                        {location.city}
                    </a>
                ))}
            </div>
            <div className="fresh-service-directory">
                {taxonomy.map((category) => (
                    <Link href={getCategoryPath(category)} key={category.id || category.slug}>
                        {category.name}
                    </Link>
                ))}
            </div>
        </section>
    );
}

function FreshFooter({ providerUrl, customerAppUrl }) {
    return (
        <footer className="fresh-footer">
            <div className="fresh-footer-inner">
                <div className="fresh-footer-brand">
                    <a className="fresh-brand" href="/">
                        <span className="fresh-brand-mark">Y</span>
                        <span>YouYaku</span>
                    </a>
                    <p>Marketplace booking salon, beauty, wellness, dan self-care lokal.</p>
                    <a className="fresh-download-pill" href={customerAppUrl}>
                        Download app
                        <QrCode size={14} />
                    </a>
                </div>
                <nav>
                    <strong>About YouYaku</strong>
                    <a href="/articles">Careers</a>
                    <a href="/articles">Blog</a>
                    <a href="/search">Sitemap</a>
                </nav>
                <nav>
                    <strong>For business</strong>
                    <a href={providerUrl}>For partners</a>
                    <a href="#pricing">Pricing</a>
                    <a href={providerUrl}>Support</a>
                </nav>
                <nav>
                    <strong>Legal</strong>
                    <a href="/privacy">Privacy Policy</a>
                    <a href="/terms">Terms of service</a>
                    <a href="/terms">Terms of use</a>
                </nav>
                <nav>
                    <strong>Find us on social</strong>
                    <a href="https://facebook.com">Facebook</a>
                    <a href="https://x.com">X</a>
                    <a href="https://instagram.com">Instagram</a>
                </nav>
            </div>
            <div className="fresh-footer-bottom">
                <span>English</span>
                <span>© 2026 YouYaku</span>
            </div>
        </footer>
    );
}

const megaMenuCards = [
    { title: 'Discover', desc: 'Search salons, treatments, locations, and available services.', href: '/search', tone: 'orange', badge: 'Search', badgeDetail: 'Venues & services', badgeIcon: Search },
    { title: 'Activity', desc: 'View saved services, appointments, booking status, and history.', href: '/activity', tone: 'violet', badge: 'Schedule', badgeDetail: 'Appointments', badgeIcon: CalendarDays },
    { title: 'Promotions', desc: 'Browse vouchers, seasonal campaigns, and customer offers.', href: '/promos', tone: 'emerald', badge: 'Offers', badgeDetail: 'Deals & vouchers', badgeIcon: Ticket },
    { title: 'Favorites', desc: 'Keep preferred salons and providers ready for quick rebooking.', href: '/favorites', tone: 'indigo', badge: 'Saved', badgeDetail: 'Your shortlist', badgeIcon: Heart },
    { title: 'Payments', desc: 'Prepare wallet, billing, and payment preferences.', href: '/profile', tone: 'plum', badge: 'Wallet', badgeDetail: 'Coming soon', badgeIcon: Wallet },
    { title: 'Support', desc: 'Access help, policies, cancellation rules, and account support.', href: '/articles', tone: 'lime', badge: 'Help', badgeDetail: 'Customer care', badgeIcon: ShieldCheck },
];

const megaMenuExplore = [
    { label: 'Find a salon', href: '/search' },
    { label: 'Browse promotions', href: '/promos' },
    { label: 'Customer reviews', href: '#reviews' },
    { label: 'Available cities', href: '#browse' },
    { label: 'Help Center', href: '/articles' },
    { label: 'Business portal', href: 'provider' },
];

const megaMenuAbout = [
    { label: 'Customer sign in', href: '/auth' },
    { label: 'Create a business account', href: 'provider' },
    { label: 'Blog', href: '/articles' },
    { label: 'Support', href: '/articles' },
];

function FreshMegaMenu({ open, onClose, onExitComplete, providerUrl, customerAppUrl, session }) {
    const router = useRouter();
    const isLoggedIn = Boolean(session?.loggedIn);
    const accountMenuLinks = [
        { label: 'Profile', href: '/profile', icon: User },
        { label: 'Activity', href: '/activity', icon: CalendarDays },
        { label: 'Wallet', href: '/profile', icon: Wallet },
        { label: 'Messages', href: '/profile', icon: MessageCircle },
        { label: 'Favorites', href: '/favorites', icon: Heart },
        { label: 'Forms', href: '/profile', icon: ClipboardList },
        { label: 'Settings', href: '/profile', icon: Settings },
    ];

    useEffect(() => {
        if (!open) return undefined;

        const lockedScrollY = window.scrollY;
        const onKey = (event) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            if ([' ', 'PageUp', 'PageDown', 'End', 'Home', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
            }
        };
        const preventScroll = (event) => event.preventDefault();
        const keepScrollPosition = () => {
            if (window.scrollY !== lockedScrollY) {
                window.scrollTo(window.scrollX, lockedScrollY);
            }
        };

        document.addEventListener('keydown', onKey);
        window.addEventListener('wheel', preventScroll, { passive: false });
        window.addEventListener('touchmove', preventScroll, { passive: false });
        window.addEventListener('scroll', keepScrollPosition, { passive: true });

        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('wheel', preventScroll);
            window.removeEventListener('touchmove', preventScroll);
            window.removeEventListener('scroll', keepScrollPosition);
        };
    }, [open, onClose]);

    function resolveHref(href) {
        return href === 'provider' ? providerUrl : href;
    }

    function handleInternalNavigation(event) {
        const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
        const href = link?.getAttribute('href') || '';

        // Relative customer routes stay inside Next's App Router. External links,
        // hashes, and logout retain their normal browser behaviour.
        if (!link || link.dataset.fullNavigation === 'true' || !href.startsWith('/') || href.startsWith('//')) {
            return;
        }

        event.preventDefault();
        onClose();
        router.push(href);
    }

    async function handleLogout(event) {
        event.preventDefault();
        onClose();
        await logoutCustomer();
        setSessionUser({ loggedIn: false, user: null });
        window.location.href = '/';
    }

    const panelVariants = {
        hidden: {
            opacity: 0,
            x: isLoggedIn ? 0 : '-50%',
            y: -10,
            scale: 0.995,
        },
        visible: {
            opacity: 1,
            x: isLoggedIn ? 0 : '-50%',
            y: 0,
            scale: 1,
            transition: {
                type: 'spring',
                stiffness: 650,
                damping: 42,
                mass: 0.65,
                when: 'beforeChildren',
                staggerChildren: 0.012,
                delayChildren: 0.015,
            },
        },
        exit: {
            opacity: 0,
            x: isLoggedIn ? 0 : '-50%',
            y: -8,
            scale: 0.997,
            transition: {
                duration: 0.12,
                ease: [0.4, 0, 0.2, 1],
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 5 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.14, ease: [0.2, 0, 0, 1] },
        },
        exit: {
            opacity: 0,
            y: -2,
            transition: { duration: 0.08, ease: [0.4, 0, 1, 1] },
        },
    };

    const groupVariants = {
        hidden: {},
        visible: {
            transition: {
                staggerChildren: 0.01,
                delayChildren: 0,
            },
        },
        exit: {
            transition: {
                staggerChildren: 0,
                staggerDirection: -1,
            },
        },
    };

    return (
        <AnimatePresence initial={false} onExitComplete={onExitComplete}>
            {open && (
                <>
                    <motion.div
                        className="fresh-mega-scrim open"
                        onClick={onClose}
                        aria-hidden="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1, ease: [0.4, 0, 0.2, 1] }}
                    />
                    <motion.div
                        className={cx('fresh-mega-menu open', isLoggedIn && 'account-menu')}
                        role="dialog"
                        aria-label={isLoggedIn ? 'YouYaku customer menu' : 'YouYaku menu'}
                        onClickCapture={handleInternalNavigation}
                        variants={panelVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
                        <div className="fresh-mega-inner">
                            {isLoggedIn ? (
                                <motion.div className="fresh-account-menu" variants={groupVariants}>
                                    <motion.h2 variants={itemVariants}>{sessionDisplayName(session)}</motion.h2>

                                    <motion.div className="fresh-account-menu-section" variants={groupVariants}>
                                        {accountMenuLinks.map((link) => {
                                            const LinkIcon = link.icon;
                                            return (
                                                <motion.a
                                                    href={resolveHref(link.href)}
                                                    key={link.label}
                                                    onClick={onClose}
                                                    variants={itemVariants}
                                                    whileHover={{ x: 1 }}
                                                    whileTap={{ scale: 0.995 }}
                                                >
                                                    <LinkIcon size={21} strokeWidth={1.8} />
                                                    <span>{link.label}</span>
                                                </motion.a>
                                            );
                                        })}
                                        <motion.a
                                            href="/"
                                            onClick={handleLogout}
                                            data-full-navigation="true"
                                            className="fresh-account-menu-logout"
                                            variants={itemVariants}
                                            whileHover={{ x: 1 }}
                                            whileTap={{ scale: 0.995 }}
                                        >
                                            Log out
                                        </motion.a>
                                    </motion.div>

                                    <motion.div className="fresh-account-menu-section has-separator" variants={groupVariants}>
                                        <motion.a href="/" onClick={onClose} variants={itemVariants} whileHover={{ x: 1 }} whileTap={{ scale: 0.995 }}>
                                            <span>Download the app</span>
                                        </motion.a>
                                        <motion.a href="/articles" onClick={onClose} variants={itemVariants} whileHover={{ x: 1 }} whileTap={{ scale: 0.995 }}>
                                            <span>Help and support</span>
                                        </motion.a>
                                        <motion.a href="/" onClick={onClose} variants={itemVariants} whileHover={{ x: 1 }} whileTap={{ scale: 0.995 }}>
                                            <Globe2 size={21} strokeWidth={1.8} />
                                            <span>English (US)</span>
                                        </motion.a>
                                    </motion.div>

                                    <motion.a
                                        href={resolveHref('provider')}
                                        onClick={onClose}
                                        className="fresh-account-business-link"
                                        variants={itemVariants}
                                        whileHover={{ x: 1 }}
                                        whileTap={{ scale: 0.995 }}
                                    >
                                        <span>For businesses</span>
                                        <ArrowRight size={23} strokeWidth={1.8} />
                                    </motion.a>
                                </motion.div>
                            ) : (
                                <motion.div className="fresh-mega-body has-cards" variants={groupVariants}>
                                    <motion.div className="fresh-mega-grid" variants={groupVariants}>
                                        {megaMenuCards.map((card) => {
                                            const BadgeIcon = card.badgeIcon;
                                            return (
                                                <motion.a
                                                    className={`fresh-mega-card tone-${card.tone}`}
                                                    href={resolveHref(card.href)}
                                                    key={card.title}
                                                    onClick={onClose}
                                                    variants={itemVariants}
                                                    whileHover={{ y: -1 }}
                                                    whileTap={{ scale: 0.99 }}
                                                    transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
                                                >
                                                    <span className="fresh-mega-card-badge">
                                                        <BadgeIcon size={16} />
                                                        <span className="fresh-mega-card-badge-copy">
                                                            <strong>{card.badge}</strong>
                                                            <em>{card.badgeDetail}</em>
                                                        </span>
                                                    </span>
                                                    <div className="fresh-mega-card-copy">
                                                        <b>{card.title}</b>
                                                        <small>{card.desc}</small>
                                                    </div>
                                                </motion.a>
                                            );
                                        })}
                                    </motion.div>
                                    <motion.div className="fresh-mega-links" variants={groupVariants}>
                                    <motion.section className="fresh-mega-links-primary" variants={groupVariants}>
                                        <small>Navigate</small>
                                        {megaMenuExplore.map((link) => (
                                            <motion.a
                                                href={resolveHref(link.href)}
                                                key={link.label}
                                                onClick={onClose}
                                                variants={itemVariants}
                                                whileHover={{ x: 2 }}
                                                whileTap={{ scale: 0.99 }}
                                            >
                                                {link.label}
                                            </motion.a>
                                        ))}
                                    </motion.section>
                                    <motion.section variants={groupVariants}>
                                        <small>Account</small>
                                        {megaMenuAbout.map((link) => (
                                            <motion.a
                                                href={resolveHref(link.href)}
                                                key={link.label}
                                                onClick={onClose}
                                                variants={itemVariants}
                                                whileHover={{ x: 2 }}
                                                whileTap={{ scale: 0.99 }}
                                            >
                                                {link.label}
                                            </motion.a>
                                        ))}
                                    </motion.section>
                                    <motion.section variants={groupVariants}>
                                        <small>Follow</small>
                                        <div className="fresh-mega-social">
                                            <motion.a href="https://x.com" onClick={onClose} aria-label="X" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>X</motion.a>
                                            <motion.a href="https://youtube.com" onClick={onClose} aria-label="YouTube" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>YT</motion.a>
                                            <motion.a href="https://instagram.com" onClick={onClose} aria-label="Instagram" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>IG</motion.a>
                                            <motion.a href="https://linkedin.com" onClick={onClose} aria-label="LinkedIn" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>in</motion.a>
                                        </div>
                                    </motion.section>
                                    </motion.div>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

export function FreshNavigation({
    providerUrl = '/provider',
    customerAppUrl = '/',
    searchSlot = null,
}) {
    const localProviderUrl = freshUseLocalizedUrl(providerUrl);
    const localCustomerAppUrl = freshUseLocalizedUrl(customerAppUrl);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerClosing, setDrawerClosing] = useState(false);
    const [session, , sessionReady] = useCustomerSessionState();

    const closeDrawer = useCallback(() => {
        setDrawerClosing(drawerOpen);
        setDrawerOpen(false);
    }, [drawerOpen]);

    const openDrawer = useCallback(() => {
        setDrawerClosing(false);
        setDrawerOpen(true);
    }, []);

    return (
        <>
            <FreshHeader
                providerUrl={localProviderUrl}
                onMenu={openDrawer}
                menuOpen={drawerOpen}
                panelActive={searchSlot ? false : drawerOpen || drawerClosing}
                onClose={closeDrawer}
                session={session}
                sessionReady={sessionReady}
                searchSlot={searchSlot}
            />
            <FreshMegaMenu
                open={drawerOpen}
                onClose={closeDrawer}
                onExitComplete={() => setDrawerClosing(false)}
                providerUrl={localProviderUrl}
                customerAppUrl={localCustomerAppUrl}
                session={session}
            />
        </>
    );
}

export function LandingPage({
    branches = [],
    locations = [],
    reviews = [],
    catalogSummary = {},
    providerUrl = '/provider',
    customerAppUrl = '/',
}) {
    const localProviderUrl = freshUseLocalizedUrl(providerUrl);
    const localCustomerAppUrl = freshUseLocalizedUrl(customerAppUrl);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerClosing, setDrawerClosing] = useState(false);
    const [session, , sessionReady] = useCustomerSessionState();

    const closeDrawer = useCallback(() => {
        setDrawerClosing(drawerOpen);
        setDrawerOpen(false);
    }, [drawerOpen]);

    const openDrawer = useCallback(() => {
        setDrawerClosing(false);
        setDrawerOpen(true);
    }, []);

    const serviceTotal = Number(catalogSummary.serviceTotal ?? branches.reduce(
        (total, branch) => total + Number(branch.servicesCount || 0),
        0
    ));
    const branchTotal = Number(catalogSummary.branchTotal ?? branches.length);
    const locationTotal = Number(catalogSummary.locationTotal ?? locations.length);
    const staffTotal = useMemo(
        () => branches.reduce((total, branch) => total + Number(branch.staffCount || 0), 0),
        [branches]
    );
    const appointmentCount = Math.max(335991, branches.length * 2400 + serviceTotal * 120 + staffTotal * 45);
    const todayAppointmentCount = Math.max(335, Math.round(appointmentCount / 1000));

    return (
        <div className="fresh-landing">
            <FreshHeader
                providerUrl={localProviderUrl}
                onMenu={openDrawer}
                menuOpen={drawerOpen}
                panelActive={drawerOpen || drawerClosing}
                onClose={closeDrawer}
                session={session}
                sessionReady={sessionReady}
            />
            <main>
                <Hero
                    branches={branches}
                    locations={locations}
                    todayAppointmentCount={todayAppointmentCount}
                    customerAppUrl={localCustomerAppUrl}
                />
                <VenuesSection branches={branches} totalBranches={branchTotal} />
                <MarketplacePreview branches={branches} />
                <AppSection branches={branches} customerAppUrl={localCustomerAppUrl} />
                <ReviewsSection reviews={reviews} summary={catalogSummary} />
                <StatsSection
                    branchTotal={branchTotal}
                    locationTotal={locationTotal}
                    serviceTotal={serviceTotal}
                    appointmentCount={appointmentCount}
                />
                <FreshBusinessSection providerUrl={localProviderUrl} />
                <PricingSection providerUrl={localProviderUrl} />
                <BrowseSection locations={locations} />
            </main>
            <FreshFooter providerUrl={localProviderUrl} customerAppUrl={localCustomerAppUrl} />
            <FreshMegaMenu
                open={drawerOpen}
                onClose={closeDrawer}
                onExitComplete={() => setDrawerClosing(false)}
                providerUrl={localProviderUrl}
                customerAppUrl={localCustomerAppUrl}
                session={session}
            />
        </div>
    );
}
