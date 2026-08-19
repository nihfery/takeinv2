import type { Metadata } from "next";

import { QueueBoard } from "./_components/queue-board";

export const metadata: Metadata = {
  title: "Appointment Queue",
};

export default function Page() {
  return <QueueBoard />;
}
