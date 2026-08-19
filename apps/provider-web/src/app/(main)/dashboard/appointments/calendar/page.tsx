import type { Metadata } from "next";

import { ProviderCalendar } from "./_components/provider-calendar";

export const metadata: Metadata = {
  title: "Appointment Calendar",
};

export default function Page() {
  return <ProviderCalendar />;
}
