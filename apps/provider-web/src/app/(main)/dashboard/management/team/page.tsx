import type { Metadata } from "next";

import { TeamManagement } from "./_components/team-management";

export const metadata: Metadata = {
  title: "Team Management",
  description: "Manage provider team members, assignments, skills, and schedules.",
};

export default function Page() {
  return <TeamManagement />;
}
