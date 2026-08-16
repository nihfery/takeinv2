'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Heart,
    Mail,
    MapPin,
    Phone,
    Share2,
    Star,
    X,
} from 'lucide-react';
import { FreshNavigation, Footer } from './LandingPage.jsx';
import { addCustomerFavorite, getCustomerFavorites, getPublicBranchReviews, getPublicBranchServices, getPublicBranchStaff, removeCustomerFavorite } from '../lib/auth-api.js';
import { getFavoritesList, saveBookingDraft, saveFavoritesList, saveStaffProfileSnapshot } from '../lib/mock-state.js';
import { findServiceByRoute, getBookingPath, getSalonPath, getSalonRouteSlug, getServiceSlug, getStaffPath } from '../lib/salon-routes.js';

const fallbackGallery = [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=86',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=86',
];

const LAST_SEARCH_URL_KEY = 'youyaku_last_search_url';

function formatPrice(value) {
    const price = Number(value || 0);
    return `IDR ${price.toLocaleString('en-US')}`;
}

function branchLocation(branch) {
    return [branch?.city, branch?.state].filter(Boolean).join(', ') || 'Indonesia';
}

function normalizeBookingDate(value) {
    const date = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';

    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? '' : date;
}

function bookingPathWithDate(branch, date) {
    const path = getBookingPath(branch);
    return date ? `${path}?date=${encodeURIComponent(date)}` : path;
}

const weekDays = [
    ['monday', 'Monday'],
    ['tuesday', 'Tuesday'],
    ['wednesday', 'Wednesday'],
    ['thursday', 'Thursday'],
    ['friday', 'Friday'],
    ['saturday', 'Saturday'],
    ['sunday', 'Sunday'],
];

function formatOpeningTime(value) {
    const matched = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!matched) return '';

    const hours = Number(matched[1]);
    const minutes = matched[2];
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    return `${displayHours}:${minutes} ${suffix}`;
}

function branchOpeningTimes(branch) {
    const activeDays = new Set((branch?.workingDays || [])
        .map((day) => String(day).trim().toLowerCase()));
    const start = formatOpeningTime(branch?.workingStartHour);
    const end = formatOpeningTime(branch?.workingEndHour);

    if (!start || !end || activeDays.size === 0) return [];

    return weekDays
        .filter(([key]) => activeDays.has(key))
        .map(([key, label]) => ({ key, label, hours: `${start} - ${end}` }));
}

function googleMapsDirectionsUrl(branch, address) {
    const lat = Number(branch?.latitude);
    const lng = Number(branch?.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch?.name || ''} ${address || ''}`.trim())}`;
}

function serviceDescription(name, category, branch) {
    return `${name} at ${branch?.name || 'this salon'} is designed for the ${category} category. This service includes a short consultation, treatment by a therapist or stylist, and finishing tailored to the customer’s needs.`;
}

function makeServices(branch, rawServices) {
    if (!Array.isArray(rawServices)) return [];

    return rawServices.map((service, index) => {
        const name = service.name || service.title || `Service ${index + 1}`;
        const category = service.category_name
            || service.category_text
            || service.service_category?.name
            || service.serviceCategory?.name
            || service.category
            || 'Other services';
        const pricing = service.pivot || {};

        return {
            id: service.id ?? service.service_id ?? service.slug ?? `${category}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            slug: service.slug || getServiceSlug({ ...service, name }),
            code: service.code,
            category,
            name,
            duration: Number(pricing.estimated_duration || service.duration || service.estimated_duration || service.minimum_duration || 0),
            price: Number(pricing.price || service.price || 0),
            description: service.description || service.desc || serviceDescription(name, category, branch),
            featured: Boolean(service.featured || service.popular || service.is_featured),
        };
    });
}

function makeTeam(rawStaff) {
    if (!Array.isArray(rawStaff)) return [];

    return rawStaff.map((staff, index) => ({
        id: staff.id ?? staff.staff_id ?? `staff-${index}`,
        name: staff.name || staff.display_name || staff.full_name || [staff.first_name, staff.last_name].filter(Boolean).join(' ') || staff.email || 'Staff',
        role: staff.role || 'Staff',
        photo: staff.image_url || staff.image || '',
        rating: Number(staff.rating),
        bio: staff.bio || '',
        skills: Array.isArray(staff.skills) ? staff.skills : [],
        reviews: Array.isArray(staff.reviews) ? staff.reviews : [],
        reviewCount: Number(staff.review_count || staff.reviews_count || 0),
        completedBookings: Number(staff.completed_bookings_count || 0),
        clientsServed: Number(staff.clients_served_count || 0),
    }));
}

function makeGallery(branch) {
    const gallery = Array.isArray(branch?.images) && branch.images.length ? branch.images : [branch?.image];
    return [...new Set([...gallery, ...fallbackGallery].filter(Boolean))];
}

function Stars({ size = 15, rating = 5 }) {
    const score = Math.max(0, Math.min(5, Number(rating) || 0));

    return (
        <span className="salon-detail-stars" aria-label={`${score.toFixed(1)} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, index) => {
                const fill = Math.max(0, Math.min(1, score - index)) * 100;

                return (
                    <span className="salon-detail-star" key={index} style={{ width: size, height: size }}>
                        <Star className="salon-detail-star-outline" size={size} fill="none" strokeWidth={1.7} />
                        <span className="salon-detail-star-fill" style={{ width: `${fill}%` }} aria-hidden="true">
                            <Star size={size} fill="currentColor" strokeWidth={0} />
                        </span>
                    </span>
                );
            })}
        </span>
    );
}

function formatReviewDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
}

function OtherVenueCard({ branch }) {
    return (
        <a className="salon-detail-mini-card" href={getSalonPath(branch)}>
            <div className="salon-detail-mini-image">
                <img src={branch.image} alt={branch.name} loading="lazy" decoding="async" />
            </div>
            <div className="salon-detail-mini-body">
                <div className="salon-detail-mini-title-row">
                    <h3>{branch.name}</h3>
                    <small>
                        <Star size={13} fill="currentColor" strokeWidth={0} />
                        {Number(branch.rating ?? 0).toFixed(1)}
                    </small>
                </div>
                <p>{branchLocation(branch)}</p>
            </div>
        </a>
    );
}

export function SalonDetailView({
    branch,
    nearbyBranches = [],
    providerUrl = '/provider',
    customerAppUrl = '/',
    initialServiceRoute = '',
    initialBookingDate = '',
}) {
    const router = useRouter();
    const gallery = useMemo(() => makeGallery(branch), [branch]);
    const galleryPreview = gallery.slice(0, 3);
    const [backendServices, setBackendServices] = useState(() => (
        Array.isArray(branch?.services) ? branch.services : []
    ));
    const [servicesStatus, setServicesStatus] = useState(() => (
        branch?.initialServicesLoaded ? 'ready' : 'loading'
    ));
    const [branchReviews, setBranchReviews] = useState(() => (
        Array.isArray(branch?.branchReviews) ? branch.branchReviews : []
    ));
    const [reviewSummary, setReviewSummary] = useState(() => branch?.reviewSummary || null);
    const [reviewsStatus, setReviewsStatus] = useState(() => (
        branch?.initialReviewsLoaded ? 'ready' : 'loading'
    ));
    const services = useMemo(() => makeServices(branch, backendServices), [branch, backendServices]);
    const [backendStaff, setBackendStaff] = useState(() => (
        Array.isArray(branch?.staff) ? branch.staff : []
    ));
    const [teamStatus, setTeamStatus] = useState(() => (
        branch?.initialStaffLoaded ? 'ready' : 'loading'
    ));
    const team = useMemo(() => makeTeam(backendStaff), [backendStaff]);
    const [selectedServices, setSelectedServices] = useState([]);
    const [isFavorite, setIsFavorite] = useState(false);
    const serviceCategories = useMemo(() => ['Featured', ...new Set(services.map((service) => service.category))].slice(0, 5), [services]);
    const [activeCategory, setActiveCategory] = useState('Featured');
    const [activeService, setActiveService] = useState(null);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
    const filteredServices = useMemo(() => {
        if (activeCategory === 'Featured') {
            const featured = services.filter((service) => service.featured);
            return featured.length ? featured : services;
        }

        return services.filter((service) => service.category === activeCategory);
    }, [activeCategory, services]);
    const visibleServices = filteredServices;
    const address = branch.address || `${branchLocation(branch)}, Indonesia`;
    const directionsUrl = useMemo(() => googleMapsDirectionsUrl(branch, address), [branch, address]);
    const ratingValue = Math.max(0, Math.min(5, Number(reviewSummary?.rating ?? branch.rating ?? 0) || 0));
    const rating = ratingValue > 0 ? ratingValue.toFixed(1) : 'New';
    const reviews = Number(reviewSummary?.count ?? branch.reviews ?? 0);
    const bookingDate = normalizeBookingDate(initialBookingDate);
    const openingTimes = useMemo(() => branchOpeningTimes(branch), [branch]);
    const contactDetails = useMemo(() => {
        const phone = [branch?.phoneCode, branch?.phoneNumber].filter(Boolean).join(' ');

        return [
            branch?.email ? { icon: Mail, label: branch.email } : null,
            phone ? { icon: Phone, label: phone } : null,
            branch?.zipCode ? { icon: MapPin, label: `Postal code ${branch.zipCode}` } : null,
        ].filter(Boolean);
    }, [branch]);
    const aboutText = branch?.description || branch?.about || [
        `${branch.name} berlokasi di ${address}.`,
        services.length ? `Available services include ${services.slice(0, 3).map((service) => service.name).join(', ')}.` : '',
    ].filter(Boolean).join(' ');

    useEffect(() => {
        if (!activeService && !isGalleryOpen) return undefined;

        const previousBodyOverflow = document.body.style.overflow;
        const previousDocumentOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousDocumentOverflow;
        };
    }, [activeService, isGalleryOpen]);

    useEffect(() => {
        if (!isGalleryOpen) return undefined;

        function handleGalleryKeyDown(event) {
            if (event.key === 'Escape') {
                setIsGalleryOpen(false);
            }

            if (event.key === 'ArrowLeft') {
                setActiveGalleryIndex((index) => (index - 1 + gallery.length) % gallery.length);
            }

            if (event.key === 'ArrowRight') {
                setActiveGalleryIndex((index) => (index + 1) % gallery.length);
            }
        }

        window.addEventListener('keydown', handleGalleryKeyDown);
        return () => window.removeEventListener('keydown', handleGalleryKeyDown);
    }, [gallery.length, isGalleryOpen]);

    useEffect(() => {
        let cancelled = false;
        const localFavorites = getFavoritesList();
        setIsFavorite(localFavorites.some((id) => String(id) === String(branch.id)));

        getCustomerFavorites()
            .then((favorites) => {
                if (cancelled) return;
                saveFavoritesList(favorites);
                setIsFavorite(favorites.some((id) => String(id) === String(branch.id)));
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [branch.id]);

    useEffect(() => {
        let cancelled = false;
        const branchId = Number(branch?.id);

        setBackendServices(Array.isArray(branch?.services) ? branch.services : []);

        if (branch?.initialServicesLoaded) {
            setServicesStatus('ready');
            return () => {
                cancelled = true;
            };
        }

        if (!Number.isInteger(branchId) || branchId <= 0) {
            setServicesStatus('unavailable');
            return () => {
                cancelled = true;
            };
        }

        setServicesStatus('loading');

        async function loadServices() {
            try {
                const branchServices = await getPublicBranchServices(branchId);
                if (cancelled) return;

                setBackendServices(branchServices);
                setServicesStatus('ready');
            } catch {
                if (!cancelled) {
                    setBackendServices([]);
                    setServicesStatus('unavailable');
                }
            }
        }

        loadServices();

        return () => {
            cancelled = true;
        };
    }, [branch?.id, branch?.initialServicesLoaded, branch?.services]);

    useEffect(() => {
        const branchId = Number(branch?.id);

        if (branch?.initialStaffLoaded || !Number.isInteger(branchId) || branchId <= 0) return undefined;

        let cancelled = false;

        getPublicBranchStaff(branchId)
            .then((staff) => {
                if (cancelled) return;

                setBackendStaff(staff);
                setTeamStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setTeamStatus('unavailable');
            });

        return () => {
            cancelled = true;
        };
    }, [branch?.id, branch?.initialStaffLoaded]);

    useEffect(() => {
        const branchId = Number(branch?.id);

        if (branch?.initialReviewsLoaded || !Number.isInteger(branchId) || branchId <= 0) return undefined;

        let cancelled = false;

        getPublicBranchReviews(branchId)
            .then((payload) => {
                if (cancelled) return;

                setBranchReviews(payload.reviews);
                setReviewSummary(payload.summary);
                setReviewsStatus('ready');
            })
            .catch(() => {
                if (!cancelled) setReviewsStatus('unavailable');
            });

        return () => {
            cancelled = true;
        };
    }, [branch?.id, branch?.initialReviewsLoaded]);

    useEffect(() => {
        if (!initialServiceRoute) return;

        const service = findServiceByRoute(services, initialServiceRoute);
        if (service) {
            setActiveCategory(service.category || 'Featured');
            setActiveService(service);
        }
    }, [initialServiceRoute, services]);

    function chooseCategory(category) {
        setActiveCategory(category);
    }

    function createBookingDraft(draftServices, staff = null) {
        saveBookingDraft({
            salonId: String(branch.id),
            salonSlug: getSalonRouteSlug(branch),
            salonName: branch.name,
            salonImage: branch.image,
            salonAddress: address,
            salonRating: rating,
            salonReviews: reviews,
            availableServices: services,
            services: draftServices,
            addons: [],
            staff,
            date: bookingDate,
            time: '',
        });
    }

    function openBooking() {
        // Keep detail and booking in one history stack so the browser Back
        // button returns to the exact salon the customer came from.
        router.push(bookingPathWithDate(branch, bookingDate));
    }

    function addService(service) {
        const nextServices = selectedServices.some((item) => item.id === service.id)
            ? selectedServices
            : [...selectedServices, service];

        setSelectedServices(nextServices);
        setActiveService(null);
        createBookingDraft(nextServices);
        openBooking();
    }

    async function toggleFavorite() {
        const previous = isFavorite;
        const next = !previous;
        const localFavorites = getFavoritesList();
        const nextFavorites = next
            ? [...localFavorites.filter((id) => String(id) !== String(branch.id)), branch.id]
            : localFavorites.filter((id) => String(id) !== String(branch.id));

        setIsFavorite(next);
        saveFavoritesList(nextFavorites);
        try {
            if (next) await addCustomerFavorite(branch.id);
            else await removeCustomerFavorite(branch.id);
        } catch (error) {
            setIsFavorite(previous);
            saveFavoritesList(localFavorites);
            if (error?.status === 401) {
                router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
            }
        }
    }

    function sharePage() {
        navigator.clipboard?.writeText(window.location.href);
    }

    function closeServiceModal() {
        setActiveService(null);

        if (window.location.pathname.includes('/services/')) {
            router.replace(getSalonPath(branch));
        }
    }

    function openServiceModal(service) {
        setActiveService(service);
    }

    function openGallery(index = 0) {
        setActiveGalleryIndex(Math.max(0, Math.min(index, gallery.length - 1)));
        setIsGalleryOpen(true);
    }

    function closeGallery() {
        setIsGalleryOpen(false);
    }

    function showPreviousGalleryImage() {
        setActiveGalleryIndex((index) => (index - 1 + gallery.length) % gallery.length);
    }

    function showNextGalleryImage() {
        setActiveGalleryIndex((index) => (index + 1) % gallery.length);
    }

    function startBooking() {
        createBookingDraft(selectedServices);
        openBooking();
    }

    function goBack() {
        const lastSearchUrl = sessionStorage.getItem(LAST_SEARCH_URL_KEY);

        if (lastSearchUrl?.startsWith('/search')) {
            router.push(lastSearchUrl);
            return;
        }

        router.push('/search');
    }

    return (
        <div className="fresh-landing salon-detail-page">
            <FreshNavigation providerUrl={providerUrl} customerAppUrl={customerAppUrl} />
            <main className="salon-detail-shell">
                <section className="salon-detail-hero-full">
                    <div className="salon-detail-hero-inner">
                        <div className="salon-detail-topline">
                            <nav className="salon-detail-breadcrumb" aria-label="Breadcrumb">
                                <a href="/">Home</a>
                                <ChevronRight size={13} />
                                <a href="/search">Salon</a>
                                <ChevronRight size={13} />
                                <a href="/search">Indonesia</a>
                                <ChevronRight size={13} />
                                <span>{branchLocation(branch)}</span>
                                <ChevronRight size={13} />
                                <span>{branch.name}</span>
                            </nav>
                            <button className="salon-detail-home" type="button" onClick={goBack} aria-label="Back to search">
                                <X size={16} />
                            </button>
                        </div>

                        <section className="salon-detail-hero">
                            <div className="salon-detail-title">
                                <h1>{branch.name}</h1>
                                <div className="salon-detail-meta">
                                    <strong>{rating}</strong>
                                    <Stars size={17} rating={ratingValue} />
                                    <a href="#reviews">({reviews})</a>
                                    <i className="salon-detail-dot" aria-hidden="true" />
                                    <span className="salon-detail-open">Open</span>
                                    <small>until 8:30 PM</small>
                                    <i className="salon-detail-dot" aria-hidden="true" />
                                    <small>{address}</small>
                                    <a href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a>
                                </div>
                            </div>
                            <div className="salon-detail-actions">
                                <button type="button" aria-label="Bagikan" onClick={sharePage}><Share2 size={18} /></button>
                                <button type="button" aria-label="Favorit" onClick={toggleFavorite}>
                                    <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                                </button>
                            </div>
                        </section>

                        <section
                            className="salon-detail-gallery salon-detail-gallery-locked"
                            aria-label="Foto salon"
                            style={{ height: '515px' }}
                        >
                            <img className="salon-detail-gallery-main" src={galleryPreview[0]} alt={branch.name} />
                            <div className="salon-detail-gallery-side">
                                <img src={galleryPreview[1]} alt="" />
                                <div>
                                    <img src={galleryPreview[2]} alt="" />
                                    <button type="button" onClick={() => openGallery(0)}>See all images</button>
                                </div>
                            </div>
                        </section>
                    </div>
                </section>

                <div className="salon-detail-body">
                    <div className="salon-detail-layout">
                        <div className="salon-detail-content">
                            <section className="salon-detail-section">
                                <h2>Services</h2>
                                <div className="salon-detail-chips">
                                    {serviceCategories.map((item) => (
                                        <button
                                            className={activeCategory === item ? 'active' : ''}
                                            type="button"
                                            key={item}
                                            onClick={() => chooseCategory(item)}
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>
                                <div className="salon-detail-services">
                                    {servicesStatus === 'loading' && visibleServices.length === 0 && (
                                        <p className="salon-detail-services-message">Loading services...</p>
                                    )}
                                    {servicesStatus !== 'loading' && visibleServices.length === 0 && (
                                        <p className="salon-detail-services-message">This salon has not published any services yet.</p>
                                    )}
                                    {visibleServices.map((service) => {
                                        const selected = selectedServices.some((item) => item.id === service.id);
                                        return (
                                            <button
                                                type="button"
                                                className="salon-detail-service"
                                                key={service.id}
                                                onClick={() => openServiceModal(service)}
                                            >
                                                <div>
                                                    <b>{service.name}</b>
                                                    <span>{service.duration} min</span>
                                                    <strong>{formatPrice(service.price)}</strong>
                                                </div>
                                                <span className="salon-detail-service-action">
                                                    {selected ? 'Added' : 'Book'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className="salon-detail-section">
                                <div className="salon-detail-section-head">
                                    <h2>Team</h2>
                                    <a href="#team">See all</a>
                                </div>
                                <div className="salon-detail-team" id="team">
                                    {teamStatus !== 'loading' && team.length === 0 && (
                                        <p className="salon-detail-services-message">This salon has not added any team members yet.</p>
                                    )}
                                    {team.map((member) => (
                                        <a
                                            className="salon-detail-team-member"
                                            key={member.id}
                                            href={getStaffPath(branch, member)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => saveStaffProfileSnapshot({
                                                branch,
                                                staff: member,
                                                services,
                                            })}
                                            aria-label={`Lihat profil ${member.name}`}
                                        >
                                            {member.photo ? (
                                                <img src={member.photo} alt={member.name} loading="lazy" decoding="async" />
                                            ) : (
                                                <span className="salon-detail-avatar-fallback">{member.name[0]}</span>
                                            )}
                                            <b>{member.name}</b>
                                            <small>{member.role}</small>
                                            {Number.isFinite(member.rating) && member.rating > 0 && (
                                                <em><Star size={10} fill="currentColor" strokeWidth={0} /> {member.rating.toFixed(1)}</em>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            </section>

                            <section className="salon-detail-section" id="reviews">
                                <h2>Reviews</h2>
                                <div className="salon-detail-review-summary">
                                    <Stars size={22} rating={ratingValue} />
                                    <b>{rating}</b>
                                    <a href="#reviews">({reviews})</a>
                                </div>
                                <div className="salon-detail-reviews">
                                    {reviewsStatus !== 'loading' && branchReviews.length === 0 && (
                                        <p className="salon-detail-services-message">This salon has no reviews yet.</p>
                                    )}
                                    {branchReviews.map((review, reviewIndex) => (
                                        <article key={review.id ?? review.review_id ?? `review-${reviewIndex}`}>
                                            <span>{String(review.customer_name || 'C').slice(0, 1).toUpperCase()}</span>
                                            <div>
                                                <b>{review.customer_name || 'Verified customer'}</b>
                                                <small>{formatReviewDate(review.created_at)}</small>
                                                <Stars size={11} rating={review.rating} />
                                                {review.comment && <p>{review.comment}</p>}
                                                {Array.isArray(review.images) && review.images.length > 0 && (
                                                    <div className="salon-detail-review-images">
                                                        {review.images.map((image, imageIndex) => (
                                                            <img key={`${review.id ?? review.review_id ?? reviewIndex}-image-${imageIndex}`} src={image} alt={`Foto ulasan dari ${review.customer_name || 'customer'}`} />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>

                            <section className="salon-detail-section" id="about">
                                <h2>About</h2>
                                <p className="salon-detail-about">{aboutText}</p>
                                <p className="salon-detail-address"><MapPin size={14} /> {address} <a href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a></p>
                            </section>

                            <section className="salon-detail-info-grid">
                                <div>
                                    <h2>Opening times</h2>
                                    {openingTimes.length ? openingTimes.map((day) => (
                                        <p key={day.key}><span>{day.label}</span><b>{day.hours}</b></p>
                                    )) : <p className="salon-detail-info-empty">Opening hours are not available yet.</p>}
                                </div>
                                <div>
                                    <h2>Contact information</h2>
                                    {contactDetails.length ? contactDetails.map((detail) => {
                                        const Icon = detail.icon;

                                        return <p key={detail.label}><Icon size={15} /> {detail.label}</p>;
                                    }) : <p className="salon-detail-info-empty">Contact information is not available yet.</p>}
                                </div>
                            </section>

                        </div>

                        <aside className="salon-detail-sidebar salon-detail-book-now-card">
                            <h2>{branch.name}</h2>
                            <div className="salon-detail-book-now-rating">
                                <strong>{rating}</strong>
                                <Stars size={22} rating={ratingValue} />
                                <a href="#reviews">({reviews})</a>
                            </div>
                            <div className="salon-detail-book-now-tags">
                                <span>Featured</span>
                                <span>Deals</span>
                            </div>
                            <button className="salon-detail-book-now-button" type="button" onClick={startBooking}>
                                Book now
                            </button>
                            <div className="salon-detail-book-now-info">
                                <div>
                                    <Clock3 size={20} />
                                    <span><b>Open</b> until 8:30 PM</span>
                                    <ChevronDown size={17} />
                                </div>
                                <div>
                                    <MapPin size={21} />
                                    <span>{address} <a href={directionsUrl} target="_blank" rel="noreferrer">Get directions</a></span>
                                </div>
                            </div>
                        </aside>
                    </div>

                    <div className="salon-detail-location-sections">
                        <section className="salon-detail-section">
                            <h2>Other locations</h2>
                            <div className="salon-detail-mini-grid">
                                {nearbyBranches.slice(0, 3).map((item) => <OtherVenueCard branch={item} key={item.id} />)}
                            </div>
                        </section>

                        <section className="salon-detail-section">
                            <h2>Venues nearby</h2>
                            <div className="salon-detail-mini-grid">
                                {nearbyBranches.slice(3, 5).map((item) => <OtherVenueCard branch={item} key={item.id} />)}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
            {activeService && (
                <div className="salon-service-modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
                    <button className="salon-service-modal-backdrop" type="button" aria-label="Tutup detail layanan" onClick={closeServiceModal} />
                    <div className="salon-service-modal-card">
                        <button className="salon-service-modal-close" type="button" aria-label="Tutup" onClick={closeServiceModal}>
                            <X size={17} />
                        </button>
                        <span className="salon-service-modal-category">{activeService.category}</span>
                        <h3 id="service-modal-title">{activeService.name}</h3>
                        <p>{activeService.description}</p>
                        <div className="salon-service-modal-info">
                            <span>Duration</span>
                            <b>{activeService.duration} min</b>
                        </div>
                        <div className="salon-service-modal-bottom">
                            <div>
                                <span>Price</span>
                                <strong>{formatPrice(activeService.price)}</strong>
                            </div>
                            <button type="button" onClick={() => addService(activeService)}>Add</button>
                        </div>
                    </div>
                </div>
            )}
            {isGalleryOpen && (
                <div className="salon-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="gallery-modal-title">
                    <button className="salon-gallery-modal-backdrop" type="button" aria-label="Close image gallery" onClick={closeGallery} />
                    <section className="salon-gallery-modal-card">
                        <header className="salon-gallery-modal-header">
                            <div>
                                <h2 id="gallery-modal-title">{branch.name}</h2>
                                <p>{activeGalleryIndex + 1} of {gallery.length} images</p>
                            </div>
                            <button type="button" onClick={closeGallery} aria-label="Close image gallery">
                                <X size={22} />
                            </button>
                        </header>
                        <div className="salon-gallery-modal-stage">
                            {gallery.length > 1 && (
                                <button className="salon-gallery-modal-nav previous" type="button" onClick={showPreviousGalleryImage} aria-label="Previous image">
                                    <ChevronLeft size={24} />
                                </button>
                            )}
                            <img src={gallery[activeGalleryIndex]} alt={`${branch.name} image ${activeGalleryIndex + 1}`} />
                            {gallery.length > 1 && (
                                <button className="salon-gallery-modal-nav next" type="button" onClick={showNextGalleryImage} aria-label="Next image">
                                    <ChevronRight size={24} />
                                </button>
                            )}
                        </div>
                        {gallery.length > 1 && (
                            <div className="salon-gallery-modal-thumbnails" aria-label="Choose an image">
                                {gallery.map((image, index) => (
                                    <button
                                        className={index === activeGalleryIndex ? 'active' : ''}
                                        type="button"
                                        key={`${image}-${index}`}
                                        onClick={() => setActiveGalleryIndex(index)}
                                        aria-label={`Show image ${index + 1}`}
                                        aria-current={index === activeGalleryIndex ? 'true' : undefined}
                                    >
                                        <img src={image} alt="" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
            <Footer providerUrl={providerUrl} customerAppUrl={customerAppUrl} />
        </div>
    );
}
