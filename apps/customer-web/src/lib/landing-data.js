import { createPublicRouteCode, getSalonSlug } from './salon-routes.js';
import {
    branchMatchesTaxonomy,
    buildServiceTaxonomy,
    fallbackServiceTaxonomy,
    hasTaxonomyFilter,
    normalizeCategorySlug,
    normalizeTaxonomyFilter,
} from './service-taxonomy.js';

const fallbackImages = [
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=86',
    'https://images.unsplash.com/photo-1552693673-1bf958298935?auto=format&fit=crop&w=900&q=86',
];

const fallbackBranches = [
    {
        id: 'glow-hair-studio',
        name: 'Glow Hair Studio',
        provider: 'Salon Rambut',
        city: 'Jakarta Selatan',
        state: 'DKI Jakarta',
        minPrice: 85000,
        rating: 5,
        reviews: 168,
        servicesCount: 18,
        staffCount: 9,
        serviceCategories: ['Haircut', 'Hair Color'],
        image: fallbackImages[0],
        tag: 'Unggulan',
        isNew: false,
    },
    {
        id: 'luna-nails-beauty',
        name: 'Luna Nails & Beauty',
        provider: 'Kuku, Eyelash',
        city: 'Jakarta Barat',
        state: 'DKI Jakarta',
        minPrice: 65000,
        rating: 4.9,
        reviews: 94,
        servicesCount: 14,
        staffCount: 7,
        serviceCategories: ['Kuku', 'Alis & Bulu Mata'],
        image: fallbackImages[1],
        tag: 'Baru',
        isNew: true,
    },
    {
        id: 'maison-de-beaute',
        name: 'Maison de Beaute',
        provider: 'Facial, Spa',
        city: 'Jakarta Pusat',
        state: 'DKI Jakarta',
        minPrice: 95000,
        rating: 5,
        reviews: 226,
        servicesCount: 22,
        staffCount: 12,
        serviceCategories: ['Facial', 'Spa'],
        image: fallbackImages[2],
        tag: 'Unggulan',
        isNew: false,
    },
    {
        id: 'the-touch-salon',
        name: 'The Touch Salon',
        provider: 'Salon Rambut',
        city: 'Tangerang Selatan',
        state: 'Banten',
        minPrice: 75000,
        rating: 4.8,
        reviews: 81,
        servicesCount: 12,
        staffCount: 6,
        serviceCategories: ['Haircut'],
        image: fallbackImages[3],
        tag: 'Unggulan',
        isNew: false,
    },
    {
        id: 'serene-spa-house',
        name: 'Serene Spa House',
        provider: 'Pijat, Spa',
        city: 'Bandung',
        state: 'Jawa Barat',
        minPrice: 120000,
        rating: 4.9,
        reviews: 132,
        servicesCount: 20,
        staffCount: 11,
        serviceCategories: ['Pijat', 'Spa'],
        image: fallbackImages[4],
        tag: 'Tren',
        isNew: true,
    },
    {
        id: 'brow-lash-lab',
        name: 'Brow & Lash Lab',
        provider: 'Alis & Bulu Mata',
        city: 'Surabaya',
        state: 'Jawa Timur',
        minPrice: 70000,
        rating: 4.7,
        reviews: 64,
        servicesCount: 11,
        staffCount: 5,
        serviceCategories: ['Alis & Bulu Mata'],
        image: fallbackImages[5],
        tag: 'Baru',
        isNew: true,
    },
    {
        id: 'nara-beauty-clinic',
        name: 'Nara Beauty Clinic',
        provider: 'Medspa',
        city: 'Denpasar',
        state: 'Bali',
        minPrice: 150000,
        rating: 5,
        reviews: 188,
        servicesCount: 25,
        staffCount: 14,
        serviceCategories: ['Medspa', 'Facial'],
        image: fallbackImages[6],
        tag: 'Unggulan',
        isNew: false,
    },
    {
        id: 'urban-gents-barber',
        name: 'Urban Gents Barber',
        provider: 'Barbershop',
        city: 'Jakarta Utara',
        state: 'DKI Jakarta',
        minPrice: 55000,
        rating: 4.8,
        reviews: 119,
        servicesCount: 9,
        staffCount: 8,
        serviceCategories: ['Barber', 'Haircut'],
        image: fallbackImages[7],
        tag: 'Tren',
        isNew: false,
    },
];

const fallbackLocations = [
    { city: 'Jakarta Selatan', state: 'DKI Jakarta' },
    { city: 'Jakarta Barat', state: 'DKI Jakarta' },
    { city: 'Jakarta Pusat', state: 'DKI Jakarta' },
    { city: 'Tangerang Selatan', state: 'Banten' },
    { city: 'Bandung', state: 'Jawa Barat' },
    { city: 'Surabaya', state: 'Jawa Timur' },
    { city: 'Denpasar', state: 'Bali' },
];

function normalizeUrl(url) {
    return String(url || '').replace(/\/$/, '');
}

function publicEnv(key, fallback = '') {
    return process.env[`NEXT_PUBLIC_${key}`] || process.env[`VITE_${key}`] || fallback;
}

function backendUrl() {
    return normalizeUrl(process.env.GO_API_BASE_URL || publicEnv('BACKEND_URL', 'http://127.0.0.1:8088'));
}

function apiBaseUrl() {
    return normalizeUrl(publicEnv('API_BASE_URL', `${backendUrl()}/api`));
}

function internalApiBaseUrl() {
    const backendProxyUrl = normalizeUrl(process.env.GO_API_BASE_URL);

    return backendProxyUrl ? `${backendProxyUrl}/api` : '';
}

function demoCatalogFallbackEnabled() {
    return process.env.NODE_ENV !== 'production' && process.env.TAKEIN_DEMO_CATALOG_FALLBACK !== 'false';
}

function apiRequestUrls(path, params = {}) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const bases = [
        // Server-side catalog requests run inside the Next container, where a
        // public loopback URL points back to Next rather than to the Go edge.
        internalApiBaseUrl(),
        apiBaseUrl(),
        'http://127.0.0.1:8088/api',
        'http://localhost:8088/api',
    ].map(normalizeUrl).filter((url, index, urls) => url && urls.indexOf(url) === index);

    return bases.map((base) => {
        const url = new URL(`${base}${cleanPath}`);

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });

        return url.toString();
    });
}

async function fetchCollection(path, params = {}, { revalidate = 0 } = {}) {
    for (const url of apiRequestUrls(path, params)) {
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                // Cache responses in Next's Data Cache and revalidate periodically so
                // repeated searches do not re-hit catalog-service on every request.
                ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' }),
                signal: AbortSignal.timeout(2500),
            });

            if (!response.ok) continue;

            const payload = await response.json();
            return Array.isArray(payload?.data) ? payload.data : [];
        } catch {
            // Keep the landing resilient when the Go edge is not running.
        }
    }

    return [];
}

async function fetchPayload(path, params = {}, { revalidate = 0 } = {}) {
    for (const url of apiRequestUrls(path, params)) {
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' }),
                signal: AbortSignal.timeout(2500),
            });

            if (response.ok) return await response.json();
        } catch {
            // The page can still render its available catalog data if this optional
            // detail request is temporarily unavailable.
        }
    }

    return null;
}

export async function getBranchInitialDetail(branchId) {
    const numericBranchId = Number(branchId);

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
        return { services: [], servicesLoaded: false, staff: [], reviews: [], summary: null };
    }

    const [servicesPayload, staffPayload, reviewsPayload] = await Promise.all([
        fetchPayload(`/branches/${numericBranchId}/services`),
        fetchPayload(`/branches/${numericBranchId}/staff`),
        fetchPayload(`/branches/${numericBranchId}/reviews`, { per_page: 100 }),
    ]);

    return {
        services: Array.isArray(servicesPayload?.data) ? servicesPayload.data : [],
        servicesLoaded: Boolean(servicesPayload && Array.isArray(servicesPayload?.data)),
        staff: Array.isArray(staffPayload?.data) ? staffPayload.data : [],
        reviews: Array.isArray(reviewsPayload?.data) ? reviewsPayload.data : [],
        summary: reviewsPayload?.summary || null,
    };
}

function serviceCategoryName(category) {
    if (typeof category === 'string') return category.trim();

    if (category && typeof category === 'object') {
        return String(category.name || category.title || category.label || '').trim();
    }

    return '';
}

function catalogCategoryIndex(categories = []) {
    return new Map((Array.isArray(categories) ? categories : []).map((category) => [
        String(category?.id ?? category?.category_id ?? ''),
        category,
    ]));
}

function normalizeCatalogService(service, index, categoriesByID) {
    const categoryID = service?.category_id ?? service?.service_category_id ?? null;
    const category = categoriesByID.get(String(categoryID ?? '')) || {};
    const parentID = service?.main_category_id ?? category?.parent_id ?? category?.parentId ?? null;
    const parent = categoriesByID.get(String(parentID ?? '')) || {};
    const categoryName = service?.category_name
        || service?.category_text
        || category?.name
        || service?.category
        || 'Featured';

    return {
        ...service,
        id: service?.id ?? service?.service_id ?? service?.slug ?? `service-${index}`,
        slug: service?.slug || '',
        code: service?.code || '',
        name: service?.name || service?.title || `Service ${index + 1}`,
        title: service?.title || service?.name || `Service ${index + 1}`,
        category: categoryName,
        categoryId: categoryID,
        categorySlug: service?.category_slug || category?.slug || '',
        mainCategoryId: parentID,
        mainCategorySlug: service?.main_category_slug || parent?.slug || '',
        description: service?.description || service?.desc || '',
        price: Number(service?.price || 0),
        minimum_duration: Number(service?.minimum_duration || 0),
        estimated_duration: Number(service?.estimated_duration || service?.duration || 30),
    };
}

function resolveAssetUrl(path) {
    if (!path) return '';

    // Absolute URLs: keep external ones (e.g. Unsplash) as-is, but rewrite backend
    // storage URLs to same-origin relative paths so they load from whatever host the
    // browser used. Combined with the Next rewrite proxy, this works across the LAN.
    if (/^https?:\/\//i.test(path)) {
        const storageIndex = path.indexOf('/storage/');
        return storageIndex >= 0 ? path.slice(storageIndex) : path;
    }

    const cleanPath = String(path).replace(/^\/+/, '');
    return cleanPath.startsWith('storage/') ? `/${cleanPath}` : `/storage/${cleanPath}`;
}

const cityCoordinates = {
    'jakarta selatan': { latitude: -6.261493, longitude: 106.8106 },
    'jakarta barat': { latitude: -6.168329, longitude: 106.758849 },
    'jakarta pusat': { latitude: -6.186486, longitude: 106.834091 },
    'jakarta utara': { latitude: -6.138414, longitude: 106.863956 },
    'jakarta timur': { latitude: -6.225014, longitude: 106.900447 },
    jakarta: { latitude: -6.208763, longitude: 106.845599 },
    'tangerang selatan': { latitude: -6.295986, longitude: 106.708073 },
    tangerang: { latitude: -6.178306, longitude: 106.631889 },
    bandung: { latitude: -6.917464, longitude: 107.619123 },
    cipagalo: { latitude: -6.968304, longitude: 107.633362 },
    bojongsoang: { latitude: -6.973765, longitude: 107.642337 },
    surabaya: { latitude: -7.257472, longitude: 112.75209 },
    denpasar: { latitude: -8.670458, longitude: 115.212629 },
    balikpapan: { latitude: -1.237927, longitude: 116.852852 },
    makassar: { latitude: -5.147665, longitude: 119.432732 },
};

function normalizePlaceName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function fallbackCoordinatesFor(city, state, index) {
    const normalizedCity = normalizePlaceName(city);
    const normalizedState = normalizePlaceName(state);
    const sources = [normalizedCity, normalizedState, `${normalizedCity} ${normalizedState}`].filter(Boolean);
    const match = Object.entries(cityCoordinates).find(([key]) => (
        sources.some((source) => source === key || source.includes(key) || key.includes(source))
    ));

    if (!match) return null;

    const base = match[1];
    const angle = (index % 12) * (Math.PI / 6);
    const radius = 0.008 + (index % 3) * 0.003;

    return {
        latitude: Number((base.latitude + Math.sin(angle) * radius).toFixed(6)),
        longitude: Number((base.longitude + Math.cos(angle) * radius).toFixed(6)),
    };
}

function normalizeBranch(branch, index, categoriesByID = new Map()) {
    const rawServiceCategories = branch?.serviceCategories || branch?.service_categories || [];
    const rawServiceTitles = branch?.serviceTitles || branch?.service_titles || [];
    const serviceCategories = Array.isArray(rawServiceCategories)
        ? rawServiceCategories.map(serviceCategoryName).filter(Boolean)
        : [];
    const serviceTitles = Array.isArray(rawServiceTitles) ? rawServiceTitles.filter(Boolean) : [];
    const image = branch?.image_url || branch?.image || branch?.photo || branch?.coverImage || branch?.cover_image || branch?.thumbnail || branch?.avatar;
    const providerName = typeof branch?.provider === 'string'
        ? branch.provider
        : branch?.provider?.name || branch?.provider_name || '';
    const rawServices = Array.isArray(branch?.services) ? branch.services : [];
    const services = rawServices.map((service, serviceIndex) => (
        normalizeCatalogService(service, serviceIndex, categoriesByID)
    ));
    const categories = [...new Set([
        ...serviceCategories,
        ...serviceTitles,
        ...services.map((service) => service.category),
    ].filter(Boolean))];
    const servicePrices = services.map((service) => Number(service.price)).filter((price) => price > 0);

    // Gallery of all branch photos (used by the hover preview auto-slider).
    const rawGallery = branch?.image_urls || branch?.images || branch?.gallery_images || branch?.gallery || [];
    const coverImage = resolveAssetUrl(image) || fallbackImages[index % fallbackImages.length];
    const gallery = [...new Set([
        coverImage,
        ...(Array.isArray(rawGallery) ? rawGallery.map(resolveAssetUrl) : []),
    ].filter(Boolean))];
    const city = String(branch?.city || branch?.city_id || branch?.state || branch?.state_id || branch?.country || branch?.country_id || branch?.locationLabel || branch?.location_label || 'Indonesia').replace(/\r?\n|\r/g, ' ').trim();
    const state = String(branch?.state || branch?.state_id || '').replace(/\r?\n|\r/g, ' ').trim();
    const rawLatitude = branch?.latitude !== undefined && branch?.latitude !== null ? Number(branch.latitude) : null;
    const rawLongitude = branch?.longitude !== undefined && branch?.longitude !== null ? Number(branch.longitude) : null;
    const backendRating = branch?.rating ?? branch?.averageRating;
    const backendReviewCount = branch?.reviews
        ?? branch?.reviewsCount
        ?? branch?.reviews_count
        ?? branch?.reviewCount
        ?? branch?.review_count;
    const fallbackCoords = Number.isFinite(rawLatitude) && Number.isFinite(rawLongitude)
        ? null
        : fallbackCoordinatesFor(city, state, index);

    return {
        id: branch?.id ?? branch?.branch_id ?? branch?.slug ?? `branch-${index}`,
        slug: getSalonSlug(branch),
        publicCode: createPublicRouteCode(branch),
        name: branch?.name || branch?.branch_name || branch?.businessName || branch?.business_name || 'YouYaku Studio',
        provider: providerName || categories.slice(0, 2).join(', ') || 'Salon Kecantikan',
        city,
        state,
        minPrice: Number(
            branch?.minPrice
            ?? branch?.min_price
            ?? branch?.priceFrom
            ?? branch?.price_from
            ?? branch?.lowestPrice
            ?? branch?.lowest_price
            ?? (servicePrices.length ? Math.min(...servicePrices) : 0)
        ),
        rating: backendRating !== undefined && backendRating !== null
            ? Number(backendRating)
            : 0,
        reviews: backendReviewCount !== undefined && backendReviewCount !== null
            ? Number(backendReviewCount)
            : 0,
        servicesCount: Number(branch?.servicesCount ?? branch?.services_count ?? branch?.serviceCount ?? branch?.service_count ?? services.length),
        staffCount: Number(branch?.staffCount ?? branch?.staffs_count ?? branch?.staff_count ?? branch?.teamCount ?? branch?.team_count ?? 0),
        serviceCategories: categories.length ? categories : ['Salon Kecantikan'],
        services,
        image: coverImage,
        images: gallery,
        tag: branch?.tag || (index % 3 === 1 ? 'Baru' : index % 3 === 2 ? 'Tren' : 'Unggulan'),
        isNew: Boolean(branch?.isNew || index % 3 === 1),
        createdAt: branch?.created_at || branch?.createdAt || null,
        updatedAt: branch?.updated_at || branch?.updatedAt || null,
        latitude: Number.isFinite(rawLatitude) ? rawLatitude : fallbackCoords?.latitude ?? null,
        longitude: Number.isFinite(rawLongitude) ? rawLongitude : fallbackCoords?.longitude ?? null,
        nextSlot: branch?.next_available_slot || branch?.nextAvailableSlot || null,
        email: branch?.email || '',
        phoneCode: branch?.phone_code || branch?.phoneCode || '',
        phoneNumber: branch?.phone_number || branch?.phoneNumber || '',
        zipCode: branch?.zip_code || branch?.zipCode || '',
        workingStartHour: branch?.working_start_hour || branch?.workingStartHour || '',
        workingEndHour: branch?.working_end_hour || branch?.workingEndHour || '',
        workingDays: Array.isArray(branch?.working_days)
            ? branch.working_days
            : (Array.isArray(branch?.workingDays) ? branch.workingDays : []),
    };
}

export function normalizeCatalogBranches(branches = [], categories = []) {
    const categoriesByID = catalogCategoryIndex(categories);
    return (Array.isArray(branches) ? branches : []).map((branch, index) => (
        normalizeBranch(branch, index, categoriesByID)
    ));
}

function compactSearchBranch(branch) {
    return {
        id: branch.id,
        slug: branch.slug,
        publicCode: branch.publicCode,
        name: branch.name,
        provider: branch.provider,
        city: branch.city,
        state: branch.state,
        minPrice: branch.minPrice,
        rating: branch.rating,
        reviews: branch.reviews,
        serviceCategories: branch.serviceCategories,
        services: branch.services.map((service) => ({
            category: service.category,
            categoryId: service.categoryId,
            categorySlug: service.categorySlug,
            mainCategoryId: service.mainCategoryId,
            mainCategorySlug: service.mainCategorySlug,
        })),
        image: branch.image,
        images: branch.images,
        tag: branch.tag,
        latitude: branch.latitude,
        longitude: branch.longitude,
    };
}

function normalizeLocation(location) {
    const label = location?.city || location?.city_id || location?.state || location?.state_id || location?.country || location?.country_id || location?.label || '';
    return {
        city: String(label).replace(/\r?\n|\r/g, ' ').trim(),
        state: String(location?.state || location?.state_id || '').replace(/\r?\n|\r/g, ' ').trim(),
    };
}

function customerInitials(name) {
    return String(name || 'Verified customer')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'VC';
}

function normalizeLandingReview(review, index) {
    const branch = review?.branch && typeof review.branch === 'object' ? review.branch : {};
    const customerName = String(review?.customer_name || 'Verified customer').trim();
    const rating = Math.min(5, Math.max(0, Number(review?.rating || 0)));

    return {
        id: review?.id ?? review?.review_id ?? `review-${index}`,
        rating,
        text: String(review?.comment || '').trim(),
        name: customerName,
        initials: customerInitials(customerName),
        branchName: String(branch?.name || 'YouYaku partner').trim(),
        location: [branch?.city, branch?.state].filter(Boolean).join(', ') || 'Indonesia',
    };
}

// Revalidation windows (seconds). Branch/category data changes infrequently, so we
// serve cached responses to keep search instant and avoid hammering the API.
const BRANCHES_TTL = 120;
const META_TTL = 300;

export async function getServiceTaxonomy() {
    const categories = await fetchAllCategories();
    const groups = buildServiceTaxonomy(categories);

    return groups.length ? groups : fallbackServiceTaxonomy;
}

export async function getServiceCategory(categorySlug) {
    const normalizedSlug = normalizeCategorySlug(categorySlug);
    const taxonomy = await getServiceTaxonomy();
    const category = taxonomy.find((group) => normalizeCategorySlug(group.slug) === normalizedSlug) || null;

    return { category, taxonomy };
}

/**
 * Fetch the full branch list once (cached). Both the landing page and the search
 * page reuse this single cached response and filter client-side, so the Go API
 * API is queried at most once per revalidation window regardless of search terms.
 */
async function fetchAllBranches() {
    return fetchCollection('/branches', { per_page: 100 }, { revalidate: BRANCHES_TTL });
}

async function fetchAllCategories() {
    return fetchCollection('/categories', {
        hierarchy: 1,
        per_page: 100,
    }, { revalidate: META_TTL });
}

export async function getLandingPayload() {
    const [apiBranches, apiLocations, apiCategories, reviewsPayload] = await Promise.all([
        fetchAllBranches(),
        fetchCollection('/locations', {}, { revalidate: META_TTL }),
        fetchAllCategories(),
        fetchPayload('/reviews', { per_page: 25 }, { revalidate: BRANCHES_TTL }),
    ]);

    const branchSource = apiBranches.length
        ? apiBranches
        : (demoCatalogFallbackEnabled() ? fallbackBranches : []);
    const normalizedBranches = normalizeCatalogBranches(branchSource, apiCategories);
    const branches = normalizedBranches.slice(0, 16);
    const normalizedLocations = (apiLocations.length ? apiLocations : fallbackLocations)
        .map(normalizeLocation)
        .filter((location) => location.city);
    const locations = normalizedLocations.slice(0, 12);
    const reviews = (Array.isArray(reviewsPayload?.data) ? reviewsPayload.data : [])
        .map(normalizeLandingReview)
        .filter((review) => review.rating > 0 || review.text)
        .slice(0, 4);
    const uniqueServices = new Set(normalizedBranches.flatMap((branch) => (
        branch.services.map((service) => service.id ? `id:${service.id}` : `${branch.id}:${service.name}`)
    )));
    const reviewTotal = Number(
        reviewsPayload?.meta?.total
        ?? normalizedBranches.reduce((total, branch) => total + Number(branch.reviews || 0), 0)
    );
    const weightedRatingTotal = normalizedBranches.reduce((total, branch) => (
        total + (Number(branch.rating || 0) * Number(branch.reviews || 0))
    ), 0);

    return {
        branches,
        locations,
        reviews,
        catalogSummary: {
            branchTotal: normalizedBranches.length,
            serviceTotal: uniqueServices.size,
            locationTotal: normalizedLocations.length,
            reviewTotal,
            reviewedBranchTotal: normalizedBranches.filter((branch) => Number(branch.reviews || 0) > 0).length,
            averageRating: reviewTotal > 0 ? weightedRatingTotal / reviewTotal : 0,
        },
        providerUrl: normalizeUrl(publicEnv('PROVIDER_FRONTEND_URL', 'http://127.0.0.1:5173')) || '/provider',
        customerAppUrl: normalizeUrl(publicEnv('CUSTOMER_APP_URL', 'http://127.0.0.1:5174')) || '/',
    };
}

function matchesService(branch, service, taxonomyFilter = {}) {
    if (hasTaxonomyFilter(taxonomyFilter)) {
        return branchMatchesTaxonomy(branch, taxonomyFilter);
    }
    if (!service) return true;
    const needle = service.toLowerCase().trim();
    const categories = (branch.serviceCategories || []).map((category) => String(category).toLowerCase());

    // Primary match: the branch actually offers a service in this category.
    if (categories.some((category) => category === needle || category.includes(needle) || needle.includes(category))) {
        return true;
    }

    // Secondary match: brand/provider name contains the term.
    return [branch.name, branch.provider].filter(Boolean).join(' ').toLowerCase().includes(needle);
}

function normalizeSearchService(value) {
    const service = String(value || '').trim();
    const label = service.toLowerCase();
    return ['all treatments', 'semua perawatan', 'semua treatment'].includes(label) ? '' : service;
}

function normalizeSearchLocation(value) {
    const location = String(value || '').trim();
    const label = location.toLowerCase();
    return ['current location', 'lokasi saat ini'].includes(label) ? '' : location;
}

function matchesLocation(branch, location) {
    if (!location) return true;
    const needle = String(location || '').toLowerCase().trim();
    const city = String(branch.city || '').toLowerCase().trim();
    const state = String(branch.state || '').toLowerCase().trim();
    const haystack = [city, state].filter(Boolean).join(' ');

    if (!needle) return true;
    if (haystack.includes(needle) || (city && needle.includes(city)) || (state && needle.includes(state))) {
        return true;
    }

    const queryTerms = needle
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !['kota', 'kabupaten', 'kab', 'kecamatan', 'provinsi', 'indonesia', 'jawa', 'barat', 'timur', 'utara', 'selatan', 'tengah'].includes(term));

    return queryTerms.some((term) => haystack.includes(term));
}

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function distanceKm(fromLat, fromLng, toLat, toLng) {
    const earthRadiusKm = 6371;
    const toRadians = (value) => (value * Math.PI) / 180;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const startLat = toRadians(fromLat);
    const endLat = toRadians(toLat);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function filterAndSortBranches(branches, { minPrice, maxPrice, minRating, sort } = {}) {
    const minimumPrice = Number(minPrice) > 0 ? Number(minPrice) : null;
    const maximumPrice = Number(maxPrice) > 0 ? Number(maxPrice) : null;
    const minimumRating = Number(minRating) > 0 ? Number(minRating) : null;
    const filtered = branches.filter((branch) => {
        const price = Number(branch.minPrice || 0);
        const rating = Number(branch.rating || 0);

        if ((minimumPrice !== null || maximumPrice !== null) && price <= 0) return false;
        if (minimumPrice !== null && price < minimumPrice) return false;
        if (maximumPrice !== null && price > maximumPrice) return false;
        return minimumRating === null || rating >= minimumRating;
    });

    return [...filtered].sort((first, second) => {
        if (sort === 'rating_desc') return Number(second.rating || 0) - Number(first.rating || 0);
        if (sort === 'price_asc') return Number(first.minPrice || Number.MAX_SAFE_INTEGER) - Number(second.minPrice || Number.MAX_SAFE_INTEGER);
        if (sort === 'price_desc') return Number(second.minPrice || 0) - Number(first.minPrice || 0);
        if (sort === 'name_asc') return String(first.name || '').localeCompare(String(second.name || ''), 'id');
        return 0;
    });
}

export async function getSearchPayload(filters = {}, { compact = false } = {}) {
    const service = normalizeSearchService(filters.service);
    const taxonomyFilter = normalizeTaxonomyFilter(filters);
    const location = normalizeSearchLocation(filters.location);
    const lat = location ? toFiniteNumber(filters.lat) : null;
    const lng = location ? toFiniteNumber(filters.lng) : null;

    // Performance: instead of issuing a filtered branch query per search (which the
    // API cannot scope to a single branch for categories anyway), we reuse ONE cached
    // branch list and filter everything client-side. This makes search instant and the
    // The Go API is hit at most once per revalidation window, not on every keystroke.
    const [apiBranches, apiLocations, apiCategories] = await Promise.all([
        fetchAllBranches(),
        fetchCollection('/locations', {}, { revalidate: META_TTL }),
        fetchAllCategories(),
    ]);

    const apiReachable = apiBranches.length > 0;
    // Full, unfiltered list so the client can re-filter instantly when the user
    // searches again, without a round-trip to the server (no browser refresh).
    const normalizedSource = (
        apiReachable
            ? apiBranches
            : (demoCatalogFallbackEnabled() ? fallbackBranches : [])
    );
    const normalized = normalizeCatalogBranches(normalizedSource, apiCategories);

    // Service filter applies to both the result list and the map exploration set.
    const serviceFiltered = service
        || hasTaxonomyFilter(taxonomyFilter)
        ? normalized.filter((branch) => matchesService(branch, service, taxonomyFilter))
        : normalized;
    const advancedFiltered = filterAndSortBranches(serviceFiltered, filters);

    // The map can be panned to other areas, while the result list starts focused on
    // the searched location. Only send the full catalog once and describe the
    // initial result order with ids; serializing the same branch objects in three
    // arrays made the search document several times larger than necessary.
    let resultBranches = advancedFiltered;
    if (lat !== null && lng !== null) {
        const nearby = advancedFiltered
            .map((branch) => ({
                ...branch,
                distanceKm: branch.latitude !== null && branch.longitude !== null
                    ? distanceKm(lat, lng, branch.latitude, branch.longitude)
                    : null,
            }))
            .filter((branch) => branch.distanceKm !== null && branch.distanceKm <= 45)
            .sort((first, second) => first.distanceKm - second.distanceKm);

        resultBranches = nearby.length || !location
            ? nearby
            : advancedFiltered.filter((branch) => matchesLocation(branch, location));
    } else if (location) {
        resultBranches = advancedFiltered.filter((branch) => matchesLocation(branch, location));
    }
    resultBranches = filterAndSortBranches(resultBranches, filters);

    const locations = (apiLocations.length ? apiLocations : fallbackLocations)
        .map(normalizeLocation)
        .filter((entry) => entry.city)
        .slice(0, 12);

    const categories = (Array.isArray(apiCategories) ? apiCategories : [])
        .map((category) => (typeof category === 'string' ? category : category?.name || category?.title || ''))
        .filter(Boolean);

    return {
        branches: [],
        mapBranches: [],
        allBranches: normalized.slice(0, 200).map((branch) => (
            compact ? compactSearchBranch(branch) : branch
        )),
        initialBranchIds: resultBranches.slice(0, 100).map((branch) => String(branch.id)),
        legacyBranches: demoCatalogFallbackEnabled() ? fallbackBranches.map(normalizeBranch) : [],
        locations,
        categories,
        providerUrl: normalizeUrl(publicEnv('PROVIDER_FRONTEND_URL', 'http://127.0.0.1:5173')) || '/provider',
        customerAppUrl: normalizeUrl(publicEnv('CUSTOMER_APP_URL', 'http://127.0.0.1:5174')) || '/',
    };
}
