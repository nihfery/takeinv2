import { CalendarOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { type BranchProfilePayload, formatProfileDate, type ProfileRecord } from "./profile-data";
import { ProfileDetailSection, ProfileMetricCard } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

const weekdayFormatter = new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "long" });

interface TimeOffDetailsProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function TimeOffDetails({ payload, profile }: TimeOffDetailsProps) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const closures = payload.branch.holidays
    .map((value) => ({ date: new Date(`${value}T00:00:00Z`), value }))
    .filter((closure) => !Number.isNaN(closure.date.getTime()))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const upcoming = closures.filter((closure) => closure.date >= today);
  const completed = closures.length - upcoming.length;

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Add or remove full-day closure dates without changing the branch's normal weekly operating schedule."
        title="Closure calendar"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProfileMetricCard description="All configured closure dates" title="Total closures" value={closures.length} />
        <ProfileMetricCard description="Dates that have not passed" title="Upcoming" value={upcoming.length} />
        <ProfileMetricCard description="Historical closure dates" title="Completed" value={completed} />
        <ProfileMetricCard description="Next full-day closure" title="Next closure" value={profile.nextLeave} />
      </div>

      <ProfileDetailSection
        badge="Branch calendar"
        description="Context used to calculate customer availability around scheduled branch closures."
        items={[
          { label: "Calendar owner", value: payload.account.name },
          { label: "Approval authority", value: payload.owner.name },
          { label: "Standard operating hours", value: profile.lastWorkingDay },
          { label: "Operating time zone", value: payload.branch.timezone },
          { label: "Operating days", value: payload.branch.working_days.length },
          { label: "Last calendar update", value: formatProfileDate(payload.branch.updated_at) },
        ]}
        title="Closure policy"
      />

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">Scheduled closure dates</h2>
          <p className="text-muted-foreground text-sm">
            Dates maintained in Edit profile. The branch is treated as unavailable for the full day.
          </p>
        </div>
        {closures.length ? (
          <Table className="border-y">
            <TableCaption className="sr-only">Scheduled closure dates for {payload.branch.branch_name}</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Availability effect</TableHead>
                <TableHead>Time zone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closures.map((closure) => {
                const isUpcoming = closure.date >= today;
                return (
                  <TableRow key={closure.value}>
                    <TableCell className="font-medium">{formatProfileDate(closure.value)}</TableCell>
                    <TableCell className="text-muted-foreground">{weekdayFormatter.format(closure.date)}</TableCell>
                    <TableCell>
                      <Badge className="rounded-sm" variant={isUpcoming ? "secondary" : "outline"}>
                        {isUpcoming ? "Upcoming" : "Completed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">Closed for the full day</TableCell>
                    <TableCell className="text-muted-foreground">{payload.branch.timezone}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarOff />
              </EmptyMedia>
              <EmptyTitle>No closure dates configured</EmptyTitle>
              <EmptyDescription>
                This branch currently follows its normal weekly schedule without scheduled full-day closures.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}
