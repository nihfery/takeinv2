import { redirect } from 'next/navigation';
import { getBranchInitialDetail, getSearchPayload } from '../../../src/lib/landing-data.js';
import { findBranchByRoute, getSalonPath, getSalonRouteSlug } from '../../../src/lib/salon-routes.js';
import { SalonDetailView } from '../../../src/components/SalonDetailView.jsx';

export const dynamic = 'force-dynamic';

async function getBranchForRoute(salonSlug) {
    const payload = await getSearchPayload();
    const branches = [
        ...(payload.allBranches?.length ? payload.allBranches : payload.branches),
        ...(payload.legacyBranches || []),
    ];
    const branch = findBranchByRoute(branches, salonSlug);

    return { payload, branches, branch };
}

function absoluteUrl(baseUrl, path) {
    const base = String(baseUrl || '').replace(/\/$/, '');
    return base ? `${base}${path}` : path;
}

function pickParam(value) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function withBookingDate(path, date) {
    return date ? `${path}?date=${encodeURIComponent(date)}` : path;
}

export async function generateMetadata({ params }) {
    const { salonSlug } = await params;
    const { payload, branch } = await getBranchForRoute(salonSlug);

    if (!branch) {
        return {
            title: 'Salon tidak ditemukan | YouYaku',
        };
    }

    const location = [branch.city, branch.state].filter(Boolean).join(', ') || 'Indonesia';
    const category = (branch.serviceCategories && branch.serviceCategories[0]) || branch.provider || 'Salon';
    const title = `${branch.name} - ${category} di ${location} | YouYaku`;
    const description = `Booking ${branch.name} di ${location}. Lihat layanan, harga, ulasan, lokasi, dan jadwal tersedia.`;
    const canonicalPath = getSalonPath(branch);

    return {
        title,
        description,
        alternates: {
            canonical: absoluteUrl(payload.customerAppUrl, canonicalPath),
        },
        openGraph: {
            title,
            description,
            url: absoluteUrl(payload.customerAppUrl, canonicalPath),
            images: branch.image ? [{ url: branch.image, alt: branch.name }] : [],
        },
    };
}

export default async function SalonDetailPage({ params, searchParams }) {
    const { salonSlug } = await params;
    const query = (await searchParams) || {};
    const initialBookingDate = pickParam(query.date);
    const { payload, branches, branch } = await getBranchForRoute(salonSlug);

    // A browser Back action can restore an old catalog URL after the branch was
    // removed, renamed, or a demo catalog was replaced by the live backend. Do
    // not leave customers on Next's bare 404 page; replace the stale entry with
    // the live search page instead.
    if (!branch) redirect('/search?notice=salon-not-found');

    const canonicalSlug = getSalonRouteSlug(branch);
    if (decodeURIComponent(String(salonSlug || '')) !== canonicalSlug) {
        redirect(withBookingDate(getSalonPath(branch), initialBookingDate));
    }

    const initialDetail = await getBranchInitialDetail(branch.id);
    const detailBranch = {
        ...branch,
        services: initialDetail.servicesLoaded ? initialDetail.services : branch.services,
        initialServicesLoaded: initialDetail.servicesLoaded,
        staff: initialDetail.staff,
        branchReviews: initialDetail.reviews,
        reviewSummary: initialDetail.summary,
        initialStaffLoaded: initialDetail.staff.length > 0,
        initialReviewsLoaded: initialDetail.reviews.length > 0 || Boolean(initialDetail.summary),
    };

    return (
        <SalonDetailView
            branch={detailBranch}
            nearbyBranches={branches.filter((item) => String(item.id) !== String(branch.id)).slice(0, 6)}
            providerUrl={payload.providerUrl}
            customerAppUrl="/"
            initialBookingDate={initialBookingDate}
        />
    );
}
