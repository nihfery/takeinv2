import ProviderDashboard from '../../../../src/ProviderDashboard.jsx';

export default async function Page({ params }) {
  const { section } = await params;
  return <ProviderDashboard section={section} />;
}
