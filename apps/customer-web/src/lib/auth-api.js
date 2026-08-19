const API_BASE = '/api';
const TOKEN_KEY = 'salonku_api_token';
const ACTIVITY_CACHE_KEY = 'salonku_customer_activity_cache';
const ACTIVITY_SUMMARY_CACHE_KEY = 'salonku_customer_activity_summary_cache';
const ACTIVITY_CACHE_TTL = 30000;

let customerActivityRequest = null;
let customerActivitySummaryRequest = null;
const AVAILABILITY_CACHE_TTL = 5000;
const ELIGIBLE_STAFF_CACHE_TTL = 15000;
const availabilityCache = new Map();
const availabilityRequests = new Map();
const eligibleStaffCache = new Map();
const eligibleStaffRequests = new Map();

const CUSTOMER_BOOKING_PAGE_QUERY = `
    query CustomerBookingPage($branchId: Int!, $serviceIds: [Int!], $bookingDate: String, $staffId: Int, $heldBookingId: Int) {
        customerBookingPage(branchId: $branchId, serviceIds: $serviceIds, bookingDate: $bookingDate, staffId: $staffId, heldBookingId: $heldBookingId) {
            branch
            booking_preview
        }
    }
`;

const CUSTOMER_BOOKING_ELIGIBLE_STAFF_QUERY = `
    query CustomerBookingEligibleStaff($branchId: Int!, $serviceIds: [Int!]!, $bookingDate: String, $staffId: Int, $participantCount: Int) {
        customerBookingEligibleStaff(branchId: $branchId, serviceIds: $serviceIds, bookingDate: $bookingDate, staffId: $staffId, participantCount: $participantCount) {
            eligible_staff
            estimated_duration
            total_price
            server_now
            timezone
        }
    }
`;

const CUSTOMER_BOOKING_AVAILABILITY_QUERY = `
    query CustomerBookingAvailability($branchId: Int!, $serviceIds: [Int!]!, $bookingDate: String, $staffId: Int, $heldBookingId: Int, $participantCount: Int) {
        customerBookingAvailability(branchId: $branchId, serviceIds: $serviceIds, bookingDate: $bookingDate, staffId: $staffId, heldBookingId: $heldBookingId, participantCount: $participantCount) {
            eligible_staff
            available_slots
            estimated_duration
            total_price
            queue_estimation
            server_now
            timezone
        }
    }
`;

export function getAuthToken() {
    return '';
}

export function storeAuthToken(token) {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
}

export function clearAuthToken() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    clearActivityCache();
}

function normalizeCustomerProfile(user) {
    if (user?.role !== 'customer') {
        throw new Error('Akun ini bukan akun customer. Silakan gunakan portal provider atau admin yang sesuai.');
    }
    const profile = user?.customer_profile || user?.customerProfile || {};
    const address = profile?.address
        || profile?.address_line_1
        || [profile?.city, profile?.state].filter(Boolean).join(', ');
    const genderMap = {
        'Laki-laki': 'male',
        Perempuan: 'female',
        Lainnya: 'other',
    };
    const normalizedGender = genderMap[profile?.gender] || profile?.gender || '';

    return {
        id: user?.id ?? null,
        customerId: profile?.customer_id || null,
        name: user?.name || '',
        email: user?.email || '',
        phone: profile?.phone_number || user?.phone_number || '',
        photo: profile?.avatar || profile?.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
        address,
        city: profile?.city || '',
        state: profile?.state || '',
        country: profile?.country || 'Indonesia',
        gender: normalizedGender,
        birth: String(profile?.date_of_birth || '').slice(0, 10),
        religion: profile?.religion || '',
        allergies: profile?.allergies || '',
        role: user?.role || 'customer',
    };
}

function activityCacheOwnerKey() {
    if (typeof window === 'undefined') return 'guest';

    try {
        const rawSession = sessionStorage.getItem('salonku_user_session');
        const session = rawSession ? JSON.parse(rawSession) : null;
        const user = session?.loggedIn ? session.user : null;
        const identity = user?.id ?? user?.email ?? 'guest';

        return String(identity).replace(/[^a-zA-Z0-9_.-]/g, '_') || 'guest';
    } catch {
        return 'guest';
    }
}

function userScopedCacheKey(key) {
    return `${key}:${activityCacheOwnerKey()}`;
}

function readSessionCache(key, maxAge = ACTIVITY_CACHE_TTL) {
    if (typeof window === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(userScopedCacheKey(key));
        if (!raw) return null;

        const cache = JSON.parse(raw);
        if (!cache || Date.now() - Number(cache.cachedAt || 0) > maxAge) return null;

        return cache.value ?? null;
    } catch {
        sessionStorage.removeItem(userScopedCacheKey(key));
        return null;
    }
}

function writeSessionCache(key, value) {
    if (typeof window === 'undefined') return;

    sessionStorage.setItem(userScopedCacheKey(key), JSON.stringify({
        cachedAt: Date.now(),
        value,
    }));
}

function normalizeActivityList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value].filter(Boolean);
}

function clearActivityCache() {
    if (typeof window === 'undefined') return;

    Object.keys(sessionStorage)
        .filter((key) => key === ACTIVITY_CACHE_KEY
            || key === ACTIVITY_SUMMARY_CACHE_KEY
            || key.startsWith(`${ACTIVITY_CACHE_KEY}:`)
            || key.startsWith(`${ACTIVITY_SUMMARY_CACHE_KEY}:`))
        .forEach((key) => sessionStorage.removeItem(key));
}

function csrfToken() {
    if (typeof document === 'undefined') return '';

    const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith('XSRF-TOKEN='));

    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
}

async function ensureCsrfCookie({ force = false } = {}) {
    // Authentication is handled by the same-origin Next.js BFF. It keeps the
    // Go access/refresh tokens in HttpOnly cookies and attaches Bearer tokens
    // server-side, so browser JavaScript never needs a CSRF token or JWT.
    void force;
}

async function parseJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

async function customerGraphqlRequest({ query, variables = {}, operationName }) {
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/graphql`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            query,
            variables,
            operationName,
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok || payload?.errors?.length) {
        const graphqlMessage = Array.isArray(payload?.errors)
            ? payload.errors.map((error) => error?.message).filter(Boolean).join(' ')
            : '';
        throw new Error(graphqlMessage || payload?.message || 'GraphQL customer booking gagal dimuat.');
    }

    return payload?.data || {};
}

export async function loginCustomer({ email, password, remember = false }) {
    clearAuthToken();
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            email,
            password,
            role: 'customer',
            remember: Boolean(remember),
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Login gagal. Periksa email dan password.');
    }

    if (!payload?.user) {
        throw new Error('Response login tidak lengkap dari server.');
    }

    return {
        user: payload.user,
        profile: normalizeCustomerProfile(payload.user),
    };
}

export async function registerCustomer({
    name,
    username = '',
    email,
    password,
    passwordConfirmation,
    phoneNumber = '',
    gender = '',
    dateOfBirth = '',
    religion = '',
    allergies = '',
}) {
    clearAuthToken();
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/auth/register/customer`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            name,
            username: username.trim() || null,
            email,
            password,
            password_confirmation: passwordConfirmation,
            phone_number: phoneNumber.trim() || null,
            gender: gender || null,
            date_of_birth: dateOfBirth || null,
            religion: religion || null,
            allergies: allergies.trim() || null,
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = Object.values(payload?.errors || {})
            .flat()
            .find(Boolean);
        throw new Error(validationMessage || payload?.message || 'Pendaftaran gagal. Coba lagi.');
    }

    if (!payload?.user) {
        throw new Error('Response pendaftaran tidak lengkap dari server.');
    }

    return {
        user: payload.user,
        profile: normalizeCustomerProfile(payload.user),
    };
}

export async function fetchCurrentCustomer() {
    const response = await fetch(`${API_BASE}/auth/customer/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok || !payload?.user || payload.user.role !== 'customer') {
        throw new Error(payload?.message || 'Session tidak aktif.');
    }

    let user = payload.user;
    const profileResponse = await fetch(`${API_BASE}/customer/profile`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    }).catch(() => null);
    if (profileResponse?.ok) {
        const profilePayload = await parseJson(profileResponse);
        if (profilePayload?.data) {
            user = { ...user, customer_profile: profilePayload.data };
        }
    }

    return {
        user,
        profile: normalizeCustomerProfile(user),
    };
}

export async function updateCustomerProfile(profilePayload) {
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify(profilePayload),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Profil belum berhasil diperbarui.');
    }

    const user = payload?.data || payload?.user;

    return {
        user,
        profile: normalizeCustomerProfile(user),
        message: payload?.message || 'Profil customer berhasil diperbarui.',
    };
}

export function getCachedCustomerActivity() {
    const cached = readSessionCache(ACTIVITY_CACHE_KEY);
    return cached === null ? null : normalizeActivityList(cached);
}

export async function getCustomerActivity({ preferCache = false } = {}) {
    if (preferCache) {
        const cached = getCachedCustomerActivity();
        if (cached !== null) return cached;
    }

    if (customerActivityRequest) return customerActivityRequest;

    customerActivityRequest = fetch(`${API_BASE}/customer/activity`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
        .then(async (response) => {
            const payload = await parseJson(response);

            if (!response.ok) {
                throw new Error(payload?.message || 'Booking activity could not be loaded.');
            }

            const activities = normalizeActivityList(payload?.data);
            writeSessionCache(ACTIVITY_CACHE_KEY, activities);
            writeSessionCache(ACTIVITY_SUMMARY_CACHE_KEY, {
                has_activity: activities.length > 0,
                count: Number(payload?.count ?? activities.length),
                data: activities,
            });

            return activities;
        })
        .finally(() => {
            customerActivityRequest = null;
        });

    return customerActivityRequest;
}

export async function getCustomerActivitySummary({ preferCache = false } = {}) {
    if (preferCache) {
        const cached = readSessionCache(ACTIVITY_SUMMARY_CACHE_KEY);
        if (cached !== null) return cached;
    }

    if (customerActivitySummaryRequest) return customerActivitySummaryRequest;

    customerActivitySummaryRequest = fetch(`${API_BASE}/customer/activity/summary`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
        .then(async (response) => {
            const payload = await parseJson(response);

            if (!response.ok) {
                throw new Error(payload?.message || 'Activity summary could not be loaded.');
            }

            const summary = {
                has_activity: Boolean(payload?.has_activity),
                count: Number(payload?.count || 0),
            };
            writeSessionCache(ACTIVITY_SUMMARY_CACHE_KEY, summary);

            return summary;
        })
        .finally(() => {
            customerActivitySummaryRequest = null;
        });

    return customerActivitySummaryRequest;
}

function normalizeBackendService(service = {}) {
    const pivot = service.pivot || {};

    return {
        id: service.id,
        name: service.title || service.name || `Service ${service.id}`,
        category: service.service_category?.name || service.serviceCategory?.name || service.category || 'Service',
        desc: service.description || '',
        description: service.description || '',
        duration: Number(pivot.estimated_duration || service.estimated_duration || service.duration || 30),
        price: Number(pivot.price || service.price || 0),
        discountPrice: null,
        slug: service.slug || '',
        code: service.code || '',
    };
}

function displayPaymentMethod(payment = {}, fallbackMethod = '') {
    if (fallbackMethod) return fallbackMethod;
    if (payment.payment_type === 'pay_at_salon') return 'Pay at Venue';
    if (payment.payment_method === 'manual') return 'Manual payment';
    if (payment.payment_channel === 'qris') return 'QRIS';
    if (payment.payment_channel) return 'Bank Transfer';
    if (payment.payment_method === 'midtrans') return 'Bank Transfer';
    return 'Pay at Venue';
}

function gatewayField(payment, snakeCase, camelCase, fallbackValue = null) {
    return payment?.[snakeCase]
        ?? payment?.[camelCase]
        ?? fallbackValue;
}

export function normalizeBackendBooking(booking = {}, fallbackDraft = {}) {
    const branch = booking.branch || {};
    const staff = booking.staff || null;
    const payment = booking.payment || {};
    const review = booking.branch_review || booking.branchReview || booking.review || fallbackDraft.review || null;
    const staffReview = booking.staff_review || booking.staffReview || null;
    const services = Array.isArray(booking.services) && booking.services.length
        ? booking.services.map(normalizeBackendService)
        : (fallbackDraft.services || []);
    const amount = Number(booking.total_price || payment.amount || fallbackDraft.total || 0);
    const status = booking.status || fallbackDraft.status;
    const hasActiveHold = ['pending_hold', 'pending', 'Pending Hold'].includes(status)
        && Boolean(booking.hold_expires_at || fallbackDraft.holdExpiresAt);

    return {
        id: booking.id,
        code: booking.booking_code || booking.code || fallbackDraft.code,
        salonId: booking.branch_id || fallbackDraft.salonId,
        salonSlug: branch.slug || fallbackDraft.salonSlug,
        salonName: branch.branch_name || branch.name || fallbackDraft.salonName,
        salonImage: branch.image_url || branch.image || fallbackDraft.salonImage,
        salonAddress: branch.address || fallbackDraft.salonAddress,
        services,
        addons: fallbackDraft.addons || [],
        staff: staff
            ? {
                id: staff.id,
                name: staff.full_name || [staff.first_name, staff.last_name].filter(Boolean).join(' ') || staff.email,
                role: staff.role || 'Staff',
                photo: staff.image || '',
                rating: Number(staff.rating || 0),
            }
            : (fallbackDraft.staff || 'any'),
        date: booking.booking_date || fallbackDraft.date,
        time: String(booking.start_time || fallbackDraft.time || '').slice(0, 5),
        duration: Number(booking.total_duration || fallbackDraft.duration || 0),
        subtotal: amount,
        discount: Number(fallbackDraft.discount || 0),
        total: amount,
        paymentMethod: displayPaymentMethod(payment, fallbackDraft.paymentMethod),
        paymentType: payment.payment_type || fallbackDraft.paymentType,
        paymentStatus: payment.status || fallbackDraft.paymentStatus,
        paymentChannel: gatewayField(payment, 'payment_channel', 'paymentChannel', fallbackDraft.paymentChannel),
        paymentOrderId: gatewayField(payment, 'midtrans_order_id', 'midtransOrderId', fallbackDraft.paymentOrderId),
        paymentTransactionId: gatewayField(payment, 'midtrans_transaction_id', 'midtransTransactionId', fallbackDraft.paymentTransactionId),
        paymentProviderStatus: gatewayField(payment, 'midtrans_transaction_status', 'midtransTransactionStatus', fallbackDraft.paymentProviderStatus),
        paymentCodeLabel: gatewayField(payment, 'payment_code_label', 'paymentCodeLabel', fallbackDraft.paymentCodeLabel),
        paymentCode: gatewayField(payment, 'payment_code', 'paymentCode', fallbackDraft.paymentCode),
        paymentBillerCode: gatewayField(payment, 'biller_code', 'billerCode', fallbackDraft.paymentBillerCode),
        paymentQrUrl: gatewayField(payment, 'qr_url', 'qrUrl', fallbackDraft.paymentQrUrl),
        paymentDeeplinkUrl: gatewayField(payment, 'deeplink_url', 'deeplinkUrl', fallbackDraft.paymentDeeplinkUrl),
        paymentExpiresAt: payment.expiry_time || fallbackDraft.paymentExpiresAt || null,
        holdStartedAt: hasActiveHold ? (booking.held_at || fallbackDraft.holdStartedAt || null) : null,
        holdExpiresAt: hasActiveHold ? (booking.hold_expires_at || fallbackDraft.holdExpiresAt || null) : null,
        notes: booking.notes || fallbackDraft.notes || '',
        participantCount: Number(booking.participant_count || fallbackDraft.participantCount || 1),
        guests: (booking.participants || [])
            .filter((participant) => !participant.is_primary)
            .map((participant) => ({
                name: participant.name || '',
                phone: participant.phone || '',
                email: participant.email || '',
                gender: participant.gender || '',
                description: participant.description || '',
            })),
        participantSelections: (booking.participants || []).map((participant) => ({
            position: Number(participant.position || 1),
            isPrimary: Boolean(participant.is_primary),
            name: participant.name || '',
            phone: participant.phone || '',
            email: participant.email || '',
            gender: participant.gender || '',
            ageGroup: participant.age_group || '',
            description: participant.description || '',
            services: (participant.services || []).map(normalizeBackendService),
            staff: participant.staff
                ? {
                    id: participant.staff.id,
                    name: participant.staff.full_name
                        || [participant.staff.first_name, participant.staff.last_name].filter(Boolean).join(' ')
                        || participant.staff.email,
                    role: participant.staff.role || 'Staff',
                    photo: participant.staff.image || '',
                    rating: Number(participant.staff.rating || 0),
                }
                : null,
            date: participant.booking_date || '',
            time: String(participant.start_time || '').slice(0, 5),
            duration: Number(participant.total_duration || 0),
            subtotal: Number(participant.total_price || 0),
        })),
        reviewed: Boolean(review || fallbackDraft.reviewed),
        rating: Number(review?.rating || fallbackDraft.rating || 0),
        comment: review?.comment || fallbackDraft.comment || '',
        staffReview: staffReview
            ? {
                staffId: Number(staffReview.staff_id || 0) || null,
                rating: Number(staffReview.rating || 0),
                comment: staffReview.comment || '',
            }
            : null,
        status,
        backend: booking,
    };
}

function bookingRequestPayload({ draft, paymentMethod, couponCode = '', notes = '', holdOnly = false }) {
    if (!draft || typeof draft !== 'object') {
        throw new Error('Data booking tidak lengkap.');
    }

    const branchId = Number(draft.branchId || draft.branch_id || draft.salonId);
    const serviceIds = numericIds(draft.services || []);
    const staffId = draft.staff && draft.staff !== 'any' ? Number(draft.staff.id) : null;
    const participantCount = Math.min(5, Math.max(1, Number(draft.participantCount || 1)));
    const participantSelections = Array.isArray(draft.participantSelections)
        ? draft.participantSelections.slice(0, participantCount)
        : [];
    const normalizedParticipantSelections = participantSelections.map((selection, index) => {
        const guest = index === 0 ? null : (draft.guests?.[index - 1] || {});
        const selectionServiceIds = numericIds(selection.services || []);
        const selectionStaffId = selection.staff && selection.staff !== 'any'
            ? Number(selection.staff.id)
            : null;

        if (!selectionServiceIds.length || selectionServiceIds.length !== (selection.services || []).length) {
            throw new Error(`Services for participant ${index + 1} are incomplete or not connected to the backend.`);
        }

        if (!selection.date || !selection.time) {
            throw new Error(`Date and time for participant ${index + 1} have not been selected.`);
        }

        return {
            position: index + 1,
            is_primary: index === 0,
            name: index === 0 ? (selection.name || null) : (guest?.name || selection.name || null),
            phone: index === 0 ? (selection.phone || null) : (guest?.phone || selection.phone || null),
            email: index === 0 ? (selection.email || null) : (guest?.email || selection.email || null),
            gender: index === 0 ? (selection.gender || null) : (guest?.gender || selection.gender || null),
            age_group: index === 0 ? (selection.age_group || null) : (guest?.age_group || selection.age_group || null),
            description: index === 0 ? (selection.description || null) : (guest?.description || selection.description || null),
            service_ids: selectionServiceIds,
            staff_id: Number.isInteger(selectionStaffId) && selectionStaffId > 0 ? selectionStaffId : null,
            booking_date: selection.date,
            start_time: String(selection.time).slice(0, 5),
        };
    });

    if (!Number.isInteger(branchId) || branchId <= 0) {
        throw new Error('This salon is not connected to the backend. Please choose a salon from backend data.');
    }

    if (!serviceIds.length || serviceIds.length !== (draft.services || []).length) {
        throw new Error('Some services are not connected to the backend. Please choose services from backend data.');
    }

    if (draft.staff && draft.staff !== 'any' && (!Number.isInteger(staffId) || staffId <= 0)) {
        throw new Error('Profesional yang dipilih belum terhubung ke backend.');
    }

    const payment = holdOnly
        ? { payment_type: 'pay_at_salon', payment_channel: null }
        : bookingPaymentPayload(paymentMethod);
    const idempotencyKey = [
        holdOnly ? 'hold' : 'booking',
        branchId,
        draft.date || 'date',
        draft.time || 'time',
        staffId || 'any',
        serviceIds.join('-'),
        participantCount,
        normalizedParticipantSelections.map((selection) => [
            selection.position,
            selection.service_ids.join('-'),
            selection.staff_id || 'any',
            selection.booking_date,
            selection.start_time,
        ].join('.')).join('_') || 'shared',
        holdOnly ? 'hold' : (payment.payment_type || 'payment'),
    ].join(':').replace(/[^a-zA-Z0-9:_.-]/g, '_').slice(0, 120);

    return {
        branch_id: branchId,
        service_ids: serviceIds,
        booking_type: 'scheduled',
        staff_id: staffId || null,
        booking_date: draft.date,
        start_time: draft.time,
        payment_type: payment.payment_type,
        payment_channel: payment.payment_channel,
        coupon_code: holdOnly ? null : (couponCode || null),
        notes: notes || null,
        hold_only: holdOnly,
        booking_hold_expires_at: null,
        idempotency_key: idempotencyKey,
        participant_count: participantCount,
        guests: holdOnly ? [] : (draft.guests || []),
        participant_selections: normalizedParticipantSelections.length > 1
            ? normalizedParticipantSelections
            : null,
    };
}

function bookingPaymentPayload(paymentMethod) {
    if (paymentMethod === 'Pay at Venue') {
        return {
            payment_type: 'pay_at_salon',
            payment_channel: null,
        };
    }

    return {
        payment_type: 'full_payment',
        payment_channel: paymentMethod === 'QRIS' ? 'qris' : 'mandiri_bill',
    };
}

function numericIds(items = []) {
    return items
        .map((item) => Number(item?.id))
        .filter((id) => Number.isInteger(id) && id > 0);
}

export async function holdCustomerBooking({ draft }) {
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify(bookingRequestPayload({
            draft,
            paymentMethod: 'Pay at Venue',
            holdOnly: true,
        })),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'The schedule could not be held.');
    }

    return normalizeBackendBooking(payload?.data, draft);
}

export async function extendCustomerBookingHold(bookingId, fallbackDraft = {}) {
    if (!bookingId) {
        throw new Error('Booking sementara tidak valid.');
    }

    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/hold/extend`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('This temporary booking is no longer available. Please choose a time again.');
        }

        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'The booking hold could not be extended.');
    }

    return normalizeBackendBooking(payload?.data, fallbackDraft);
}

export async function finalizeCustomerBooking({ bookingId, draft, paymentMethod, couponCode = '', notes = '', guests = [] }) {
    if (!bookingId) {
        throw new Error('Booking sementara tidak valid.');
    }

    await ensureCsrfCookie();
    const finalPayment = bookingPaymentPayload(paymentMethod);

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/finalize`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            payment_type: finalPayment.payment_type,
            payment_channel: finalPayment.payment_channel,
            coupon_code: couponCode || null,
            notes: notes || null,
            participant_count: Math.min(5, Math.max(1, Number(draft?.participantCount || 1))),
            guests,
            idempotency_key: [
                'finalize',
                bookingId,
                finalPayment.payment_type,
                finalPayment.payment_channel || 'venue',
                couponCode || 'none',
            ].join(':').replace(/[^a-zA-Z0-9:_.-]/g, '_').slice(0, 120),
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('This temporary booking is no longer available. Please choose a time again.');
        }

        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Booking belum berhasil dikonfirmasi.');
    }

    return normalizeBackendBooking(payload?.data, {
        ...draft,
        paymentMethod,
        notes,
    });
}

export async function listCustomerBookings() {
    const response = await fetch(`${API_BASE}/customer/bookings?per_page=100`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Activity could not be loaded from the backend.');
    }

    const items = Array.isArray(payload?.data?.data)
        ? payload.data.data
        : Array.isArray(payload?.data)
            ? payload.data
            : [];

    return items.map((booking) => normalizeBackendBooking(booking));
}

export async function cancelCustomerBooking(bookingId) {
    if (!bookingId) {
        throw new Error('Booking tidak valid.');
    }

    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Booking belum berhasil dibatalkan.');
    }

    if (payload?.data?.released) {
        return payload.data;
    }

    return normalizeBackendBooking(payload?.data);
}

export async function rescheduleCustomerBooking({ bookingId, bookingDate, startTime, staffId = null }) {
    if (!bookingId) {
        throw new Error('Booking tidak valid.');
    }

    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/reschedule`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            booking_date: bookingDate,
            start_time: startTime,
            staff_id: staffId || null,
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Booking belum berhasil dipindahkan.');
    }

    return normalizeBackendBooking(payload?.data);
}

export async function getCustomerBookingByCode(bookingCode, fallbackDraft = {}) {
    const response = await fetch(`${API_BASE}/customer/bookings/code/${encodeURIComponent(bookingCode)}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Booking tidak ditemukan di backend.');
    }

    return normalizeBackendBooking(payload?.data, fallbackDraft);
}

export async function submitCustomerBookingReview(bookingCode, review = {}) {
    const formData = new FormData();

    ['rating', 'comment', 'staff_id', 'staff_rating', 'staff_comment'].forEach((key) => {
        const value = review[key];

        if (value !== undefined && value !== null && value !== '') {
            formData.append(key, String(value));
        }
    });

    Array.from(review.images || []).slice(0, 5).forEach((image) => {
        formData.append('images[]', image);
    });

    const response = await fetch(`${API_BASE}/customer/bookings/code/${encodeURIComponent(bookingCode)}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: formData,
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Your review could not be submitted.');
    }

    return normalizeBackendBooking(payload?.data);
}

function normalizePublicBranch(branch = {}) {
    return {
        ...branch,
        id: branch.id,
        name: branch.branch_name || branch.name || `Salon ${branch.id}`,
        city: branch.city_id || branch.city || '',
        state: branch.state_id || branch.state || '',
        country: branch.country_id || branch.country || 'Indonesia',
        image: branch.image_url || branch.image || branch.image_urls?.[0] || '',
        rating: Number(branch.rating || branch.branch_reviews_avg_rating || 0),
        reviews: Number(branch.review_count || branch.branch_reviews_count || 0),
        minPrice: Number(branch.min_price || 0),
        servicesCount: Number(branch.services_count || 0),
        staffCount: Number(branch.staffs_count || 0),
    };
}

export async function getPublicBranches() {
    const response = await fetch(`${API_BASE}/branches?per_page=100`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Daftar salon belum dapat dimuat.');
    }

    return Array.isArray(payload?.data)
        ? payload.data.map(normalizePublicBranch)
        : [];
}

export async function getCustomerFavorites() {
    const response = await fetch(`${API_BASE}/customer/favorites`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        const error = new Error(payload?.message || 'Daftar favorit belum dapat dimuat.');
        error.status = response.status;
        throw error;
    }
    return Array.isArray(payload?.data)
        ? payload.data.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
}

export async function addCustomerFavorite(branchId) {
    const response = await fetch(`${API_BASE}/customer/favorites`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ branch_id: Number(branchId) }),
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        const error = new Error(payload?.message || 'Salon belum berhasil disimpan.');
        error.status = response.status;
        throw error;
    }
    return payload?.data || { branch_id: Number(branchId) };
}

export async function removeCustomerFavorite(branchId) {
    const response = await fetch(`${API_BASE}/customer/favorites/${encodeURIComponent(branchId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = response.status === 204 ? null : await parseJson(response);
    if (!response.ok) {
        const error = new Error(payload?.message || 'Favorit belum berhasil dihapus.');
        error.status = response.status;
        throw error;
    }
}

export async function getPublicCoupons() {
    const response = await fetch(`${API_BASE}/coupons?per_page=50`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Promo aktif belum dapat dimuat.');
    }

    return Array.isArray(payload?.data) ? payload.data : [];
}

export async function validateCustomerCoupon({ couponCode, serviceIds = [] }) {
    const numericServiceIds = serviceIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

    if (!String(couponCode || '').trim() || numericServiceIds.length === 0) {
        throw new Error('Kode voucher dan layanan wajib dipilih.');
    }

    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/coupons/validate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify({
            coupon_code: String(couponCode).trim().toUpperCase(),
            service_ids: numericServiceIds,
        }),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().find(Boolean)
            : '';
        throw new Error(validationMessage || payload?.message || 'Voucher tidak dapat diterapkan.');
    }

    return payload?.data || {};
}

export async function getPublicBranchDetail(branchId) {
    const numericBranchId = Number(branchId);

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
        throw new Error('Branch backend tidak valid.');
    }

    const data = await customerGraphqlRequest({
        query: CUSTOMER_BOOKING_PAGE_QUERY,
        operationName: 'CustomerBookingPage',
        variables: {
            branchId: numericBranchId,
            serviceIds: [],
            bookingDate: null,
            staffId: null,
            heldBookingId: null,
        },
    });

    return data?.customerBookingPage?.branch || null;
}

export async function getPublicStaffProfile(staffId) {
    const numericStaffId = Number(staffId);

    if (!Number.isInteger(numericStaffId) || numericStaffId <= 0) {
        throw new Error('Staff backend tidak valid.');
    }

    const response = await fetch(`${API_BASE}/staff/${numericStaffId}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload?.message || 'Profil staff tidak ditemukan.');
    }

    return payload?.data || null;
}

export async function getPublicBranchServices(branchId) {
    const numericBranchId = Number(branchId);

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
        throw new Error('Branch backend tidak valid.');
    }

    const response = await fetch(`${API_BASE}/branches/${numericBranchId}/services`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Services for this venue could not be loaded.');
    }

    return Array.isArray(payload?.data) ? payload.data : [];
}

export async function getPublicBranchStaff(branchId) {
    const numericBranchId = Number(branchId);

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
        throw new Error('Branch backend tidak valid.');
    }

    const response = await fetch(`${API_BASE}/branches/${numericBranchId}/staff`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Tim tempat ini tidak dapat dimuat.');
    }

    return Array.isArray(payload?.data) ? payload.data : [];
}

export async function getPublicBranchReviews(branchId) {
    const numericBranchId = Number(branchId);

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0) {
        throw new Error('Branch backend tidak valid.');
    }

    const response = await fetch(`${API_BASE}/branches/${numericBranchId}/reviews?per_page=100`, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Review tempat ini tidak dapat dimuat.');
    }

    return {
        reviews: Array.isArray(payload?.data) ? payload.data : [],
        summary: payload?.summary || { rating: null, count: 0 },
        meta: payload?.meta || null,
    };
}

function slotPeriod(time) {
    const hour = Number(String(time || '').slice(0, 2));

    if (hour < 12) return 'Pagi';
    if (hour < 15) return 'Siang';
    if (hour < 18) return 'Sore';
    return 'Malam';
}

function normalizeEligibleStaff(staffItems = []) {
    return Array.isArray(staffItems)
        ? staffItems.map((staff) => ({
            id: staff.id,
            name: staff.name || staff.full_name || [staff.first_name, staff.last_name].filter(Boolean).join(' ') || staff.email || `Staff ${staff.id}`,
            role: staff.role || 'Professional',
            photo: staff.photo || staff.image || staff.image_url || '',
            rating: Number(staff.rating || 0),
            reviews: Number(staff.reviews || staff.review_count || 0),
            reviewItems: Array.isArray(staff.reviewItems)
                ? staff.reviewItems
                : (Array.isArray(staff.reviews) ? staff.reviews : []),
            bio: staff.bio || '',
            completedBookings: Number(staff.completedBookings || staff.completed_bookings_count || 0),
            clientsServed: Number(staff.clientsServed || staff.clients_served_count || 0),
            skills: staff.skills || [],
        }))
        : [];
}

function normalizeAvailabilityPayload(data = {}) {
    const eligibleStaff = normalizeEligibleStaff(data.eligible_staff);
    const sourceSlots = Array.isArray(data.time_slots) && data.time_slots.length
        ? data.time_slots
        : (Array.isArray(data.available_slots) ? data.available_slots : []);
    const slots = sourceSlots
        .map((slot) => {
            const isAvailable = slot.is_available !== false && slot.status !== 'Not available';

            return {
                start: String(slot.time || '').slice(0, 5),
                end: String(slot.estimated_end_time || '').slice(0, 5),
                period: slotPeriod(slot.time),
                status: isAvailable ? 'Available' : 'Not available',
                staffId: Number(slot.staff_id),
                staffName: slot.staff_name,
            };
        })
        .filter((slot) => slot.start);
    const uniqueSlots = [...slots.reduce((map, slot) => {
        const current = map.get(slot.start);

        if (!current || (current.status === 'Not available' && slot.status !== 'Not available')) {
            map.set(slot.start, slot);
        }

        return map;
    }, new Map()).values()].sort((first, second) => first.start.localeCompare(second.start));
    const availableSlots = uniqueSlots.filter((slot) => slot.status !== 'Not available');

    return {
        ...data,
        eligible_staff: eligibleStaff,
        available_slots: uniqueSlots,
        selectable_slots: availableSlots,
    };
}

function bookingSelectionRequestBody({ branchId, serviceIds, bookingDate = null, staffId = null, participantCount = 1 }) {
    const numericBranchId = Number(branchId);
    const numericServiceIds = (serviceIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    const numericStaffId = staffId ? Number(staffId) : null;

    if (!Number.isInteger(numericBranchId) || numericBranchId <= 0 || numericServiceIds.length === 0) {
        throw new Error('Data branch atau service belum lengkap.');
    }

    return {
        branch_id: numericBranchId,
        service_ids: numericServiceIds,
        booking_type: 'scheduled',
        booking_date: bookingDate || null,
        staff_id: Number.isInteger(numericStaffId) && numericStaffId > 0 ? numericStaffId : null,
        participant_count: Math.min(5, Math.max(1, Number(participantCount || 1))),
    };
}

export async function checkCustomerBookingEligibleStaff({ branchId, serviceIds, bookingDate = null, staffId = null, participantCount = 1, force = false }) {
    const requestBody = bookingSelectionRequestBody({ branchId, serviceIds, bookingDate, staffId, participantCount });
    const requestKey = JSON.stringify(requestBody);

    if (!force) {
        const cached = eligibleStaffCache.get(requestKey);

        if (cached && Date.now() - cached.cachedAt < ELIGIBLE_STAFF_CACHE_TTL) {
            return cached.value;
        }

        const pending = eligibleStaffRequests.get(requestKey);

        if (pending) {
            return pending;
        }
    }

    const request = (async () => {
        const data = await customerGraphqlRequest({
            query: CUSTOMER_BOOKING_ELIGIBLE_STAFF_QUERY,
            operationName: 'CustomerBookingEligibleStaff',
            variables: {
                branchId: requestBody.branch_id,
                serviceIds: requestBody.service_ids,
                bookingDate: requestBody.booking_date,
                staffId: requestBody.staff_id,
                participantCount: requestBody.participant_count,
            },
        });

        const result = {
            ...(data?.customerBookingEligibleStaff || {}),
            eligible_staff: normalizeEligibleStaff(data?.customerBookingEligibleStaff?.eligible_staff),
            available_slots: [],
        };

        if (!force) {
            eligibleStaffCache.set(requestKey, {
                cachedAt: Date.now(),
                value: result,
            });
        }

        return result;
    })();

    if (!force) {
        eligibleStaffRequests.set(requestKey, request);
        request.finally(() => eligibleStaffRequests.delete(requestKey)).catch(() => {});
    }

    return request;
}

export async function checkCustomerBookingAvailability({ branchId, serviceIds, bookingDate, staffId = null, heldBookingId = null, participantCount = 1, force = false }) {
    const numericHeldBookingId = heldBookingId ? Number(heldBookingId) : null;
    const requestBody = {
        ...bookingSelectionRequestBody({ branchId, serviceIds, bookingDate, staffId, participantCount }),
        held_booking_id: Number.isInteger(numericHeldBookingId) && numericHeldBookingId > 0 ? numericHeldBookingId : null,
    };
    const requestKey = JSON.stringify(requestBody);

    if (!force) {
        const cached = availabilityCache.get(requestKey);

        if (cached && Date.now() - cached.cachedAt < AVAILABILITY_CACHE_TTL) {
            return cached.value;
        }

        const pending = availabilityRequests.get(requestKey);

        if (pending) {
            return pending;
        }
    }

    const request = (async () => {
        const data = await customerGraphqlRequest({
            query: CUSTOMER_BOOKING_AVAILABILITY_QUERY,
            operationName: 'CustomerBookingAvailability',
            variables: {
                branchId: requestBody.branch_id,
                serviceIds: requestBody.service_ids,
                bookingDate: requestBody.booking_date,
                staffId: requestBody.staff_id,
                heldBookingId: requestBody.held_booking_id,
                participantCount: requestBody.participant_count,
            },
        });

        const result = normalizeAvailabilityPayload(data?.customerBookingAvailability || {});

        if (!force) {
            availabilityCache.set(requestKey, {
                cachedAt: Date.now(),
                value: result,
            });
        }

        return result;
    })();

    if (!force) {
        availabilityRequests.set(requestKey, request);
        request.finally(() => availabilityRequests.delete(requestKey)).catch(() => {});
    }

    return request;
}

export function pingCustomerBookingInteraction({ event, branchId = null, serviceIds = [], staffId = null, bookingDate = null, startTime = null }) {
    if (typeof window === 'undefined' || !event) return;

    const payload = JSON.stringify({
        event,
        branch_id: branchId ? Number(branchId) : null,
        service_ids: (serviceIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
        staff_id: staffId ? Number(staffId) : null,
        booking_date: bookingDate || null,
        start_time: startTime || null,
    });
    const url = `${API_BASE}/customer/booking/interaction`;

    ensureCsrfCookie().then(() => fetch(url, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: payload,
    })).catch(() => {});
}

export async function confirmCustomerPaymentByCode(bookingCode, fallbackDraft = {}) {
    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings/code/${encodeURIComponent(bookingCode)}/payment/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        throw new Error(payload?.message || 'Payment could not be confirmed by the backend.');
    }

    return normalizeBackendBooking(payload?.data, fallbackDraft);
}

export async function chargeCustomerBookingPayment(bookingId, fallbackDraft = {}, paymentChannel = '') {
    if (!bookingId) {
        throw new Error('Booking tidak valid untuk diproses.');
    }

    await ensureCsrfCookie();

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/payment/charge`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': csrfToken(),
        },
        body: JSON.stringify(paymentChannel ? { payment_channel: paymentChannel } : {}),
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Instruksi pembayaran belum berhasil dibuat.');
    }

    return normalizeBackendBooking(payload?.data?.booking || payload?.data, fallbackDraft);
}

export async function refreshCustomerBookingPaymentStatus(bookingId, fallbackDraft = {}) {
    if (!bookingId) {
        throw new Error('Booking tidak valid untuk diperiksa.');
    }

    const response = await fetch(`${API_BASE}/customer/bookings/${encodeURIComponent(bookingId)}/payment/status`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    const payload = await parseJson(response);

    if (!response.ok) {
        const validationMessage = payload?.errors
            ? Object.values(payload.errors).flat().filter(Boolean).join(' ')
            : '';
        throw new Error(validationMessage || payload?.message || 'Status pembayaran belum bisa diperiksa.');
    }

    return normalizeBackendBooking(payload?.data?.booking || payload?.data, fallbackDraft);
}

export async function logoutCustomer() {
    try {
        await ensureCsrfCookie();
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': csrfToken(),
            },
        });
    } catch {
        // Logout must still remove the customer session in this browser even
        // when the API cannot be reached. The next authenticated request will
        // no longer send the locally stored bearer token.
    } finally {
        clearAuthToken();
    }
}
