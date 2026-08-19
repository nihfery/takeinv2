import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  type BranchProfilePayload,
  formatProfileDate,
  type ProfileRecord,
  profileWeeklyHours,
  titleCaseProfileValue,
} from "./profile-data";
import { ProfileDetailSection } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function shortTime(value: string) {
  return value.length >= 5 ? value.slice(0, 5) : value || "Not configured";
}

interface EmploymentDetailsProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function EmploymentDetails({ payload, profile }: EmploymentDetailsProps) {
  const { branch, provider } = payload;
  const openDays = new Set(branch.working_days.map((day) => day.toLowerCase()));
  const operatingHours = `${shortTime(branch.working_start_hour)} – ${shortTime(branch.working_end_hour)}`;

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Manage the branch location, service model, timezone, operating hours, and weekly availability."
        title="Branch operations"
      />

      <ProfileDetailSection
        badge="Operational location"
        description="Physical or service location information used by branch discovery and operational planning."
        items={[
          { label: "Street address", value: branch.address ? branch.address : "Not configured" },
          { label: "City", value: branch.city_id ? branch.city_id : "Not configured" },
          { label: "Province or state", value: branch.state_id ? branch.state_id : "Not configured" },
          { label: "Country", value: branch.country_id ? branch.country_id : "Not configured" },
          { label: "Postal code", value: branch.zip_code ? branch.zip_code : "Not configured" },
          { label: "Full branch address", value: profile.address },
          { label: "Branch model", value: titleCaseProfileValue(branch.branch_type) },
          { label: "Service category", value: titleCaseProfileValue(provider.category, "Beauty & Wellness") },
          { label: "Operating time zone", value: branch.timezone },
        ]}
        title="Location and service setup"
      />

      <Separator />

      <ProfileDetailSection
        badge="Branch schedule"
        description="Lifecycle and availability configuration applied to this branch."
        items={[
          { label: "Branch status", value: titleCaseProfileValue(branch.status) },
          { label: "Opened date", value: formatProfileDate(branch.opened_at ?? branch.created_at) },
          { label: "Operating duration", value: profile.engagementLength },
          { label: "Standard daily hours", value: operatingHours },
          { label: "Weekly operating hours", value: profileWeeklyHours(branch) },
          { label: "Configured operating days", value: `${branch.working_days.length} days` },
          { label: "Scheduled closure dates", value: `${branch.holidays.length} dates` },
          { label: "Next scheduled closure", value: profile.nextLeave },
          { label: "Last operational update", value: formatProfileDate(branch.updated_at) },
        ]}
        title="Operating configuration"
      />

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">Weekly operating schedule</h2>
          <p className="text-muted-foreground text-sm">
            Normal opening availability for every day of the week, before scheduled closure dates are applied.
          </p>
        </div>
        <Table className="border-y">
          <TableCaption className="sr-only">Weekly operating schedule for {branch.branch_name}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Day</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opens</TableHead>
              <TableHead>Closes</TableHead>
              <TableHead>Time zone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weekdays.map((day) => {
              const isOpen = openDays.has(day);
              return (
                <TableRow key={day}>
                  <TableCell className="font-medium">{titleCaseProfileValue(day)}</TableCell>
                  <TableCell>
                    <Badge className="rounded-sm" variant={isOpen ? "secondary" : "outline"}>
                      {isOpen ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {isOpen ? shortTime(branch.working_start_hour) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {isOpen ? shortTime(branch.working_end_hour) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{branch.timezone}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
