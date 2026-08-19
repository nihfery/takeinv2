import { redirect } from 'next/navigation';

const dashboardUrl = process.env.NEXT_PUBLIC_PROVIDER_DASHBOARD_URL
  || 'http://127.0.0.1:5175/dashboard/default';

export default async function ProviderDashboardRedirect({ params }) {
  const { section = [] } = await params;
  const target = new URL(dashboardUrl);

  if (section.length) {
    target.pathname = `${target.pathname.replace(/\/$/, '')}/${section.map(encodeURIComponent).join('/')}`;
  }

  redirect(target.toString());
}
