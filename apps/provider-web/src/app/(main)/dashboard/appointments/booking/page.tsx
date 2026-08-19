import type { Metadata } from "next";

import { BookingList } from "./_components/booking-list";

export const metadata: Metadata = {
  title: "Booking",
};

export default function Page() {
  return <BookingList />;
}
