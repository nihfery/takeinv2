import { notFound, redirect } from 'next/navigation';
import { StaffProfileRoute } from '../../../src/components/StaffProfileRoute.jsx';
import { getStaffPath, staffIdFromRoute } from '../../../src/lib/salon-routes.js';

export const dynamic = 'force-dynamic';

function apiBaseUrl() {
    const proxyUrl = String(process.env.GO_API_BASE_URL || '').replace(/\/$/, '');
    if (proxyUrl) return proxyUrl.endsWith('/api') ? proxyUrl : `${proxyUrl}/api`;

    return String(
        process.env.NEXT_PUBLIC_API_BASE_URL
        || process.env.VITE_API_BASE_URL
        || `${process.env.GO_API_BASE_URL || 'http://127.0.0.1:8088'}/api`
    ).replace(/\/$/, '');
}

async function getStaffProfile(staffRoute) {
    const numericStaffId = Number(staffIdFromRoute(staffRoute));
    if (!Number.isInteger(numericStaffId) || numericStaffId <= 0) return null;

    try {
        const response = await fetch(`${apiBaseUrl()}/staff/${numericStaffId}`, {
            headers: { Accept: 'application/json' },
            next: { revalidate: 3600 },
        });
        if (!response.ok) return null;

        const payload = await response.json();
        const branch = payload?.data;
        const staff = (branch?.staff || branch?.staffs || [])
            .find((member) => Number(member?.id) === numericStaffId);

        return branch && staff
            ? { branch, staff, services: branch.services || [] }
            : null;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }) {
    const { staffId } = await params;
    const profile = await getStaffProfile(staffId);
    if (!profile) return { title: 'Professional not found | YouYaku' };

    const staffName = profile.staff.full_name
        || [profile.staff.first_name, profile.staff.last_name].filter(Boolean).join(' ')
        || profile.staff.name
        || 'Professional';
    const workplace = String(profile.branch.name || profile.branch.branch_name || '').trim();
    const professionalLabel = workplace ? `${staffName} di ${workplace}` : staffName;

    return {
        title: `${professionalLabel} | YouYaku`,
        description: workplace
            ? `Lihat profil, layanan, ulasan, dan lokasi ${staffName}, professional di ${workplace}.`
            : `Lihat profil, layanan, ulasan, dan lokasi ${staffName} di YouYaku.`,
        alternates: {
            canonical: getStaffPath(profile.branch, profile.staff),
        },
    };
}

export default async function StaffProfilePage({ params }) {
    const { staffId } = await params;
    const profile = await getStaffProfile(staffId);

    if (!profile) notFound();

    const canonicalPath = getStaffPath(profile.branch, profile.staff);
    const canonicalRoute = decodeURIComponent(canonicalPath.slice('/p/'.length));
    if (decodeURIComponent(String(staffId || '')) !== canonicalRoute) {
        redirect(canonicalPath);
    }

    return <StaffProfileRoute staffId={staffIdFromRoute(staffId)} initialProfile={profile} />;
}
