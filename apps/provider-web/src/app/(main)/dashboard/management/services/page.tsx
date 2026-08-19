import type { Metadata } from "next";

import { ServiceManagement } from "./_components/service-management";

export const metadata: Metadata = {
  title: "Service Management",
  description: "Manage provider services, pricing, duration, and branch availability.",
};

export default function Page() {
  return <ServiceManagement />;
}
