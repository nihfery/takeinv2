import AdminDashboard from '../../../../src/AdminDashboard.jsx';

export default async function Page({ params }) {
  const { section } = await params;
  return <AdminDashboard section={section} />;
}
