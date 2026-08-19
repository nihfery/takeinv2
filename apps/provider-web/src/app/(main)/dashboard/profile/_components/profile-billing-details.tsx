import { LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { BranchProfilePayload, ProfileRecord } from "./profile-data";
import { ProfileDetailSection, ProfileMetricCard } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

interface BillingDetailsProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function BillingDetails({ payload, profile }: BillingDetailsProps) {
  const hasPaymentsAccess = payload.account.permissions.includes("payments");
  const accessRows = [
    {
      area: "Subscription and plan",
      authority: "Provider owner",
      scope: "Provider-wide",
      status: "Restricted",
    },
    { area: "Invoices", authority: "Provider owner or finance role", scope: "Provider-wide", status: "Restricted" },
    { area: "Payment methods", authority: "Provider owner", scope: "Provider-wide", status: "Restricted" },
    {
      area: "Branch transaction reports",
      authority: "Branch role with Payments permission",
      scope: profile.contractorId,
      status: hasPaymentsAccess ? "Available" : "Not granted",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Review the billing owner and access boundary assigned to this branch account."
        title="Billing information"
        locked
      />

      <Alert>
        <LockKeyhole />
        <AlertTitle>Provider-level billing is protected</AlertTitle>
        <AlertDescription>
          This branch profile can identify its billing owner and access boundary, but subscriptions, invoices, and
          payment methods remain controlled by the provider owner or an authorized finance role.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ProfileMetricCard
          description="Reference used to scope branch records"
          title="Billing reference"
          value={profile.contractorId}
        />
        <ProfileMetricCard
          description="Entity responsible for provider billing"
          title="Bill-to entity"
          value={profile.contractingEntity}
        />
        <ProfileMetricCard
          badge={hasPaymentsAccess ? "Granted" : "Restricted"}
          description="Transaction reporting for this login"
          title="Branch payment access"
          value={hasPaymentsAccess ? "Available" : "Not granted"}
        />
      </div>

      <ProfileDetailSection
        badge="Provider controlled"
        description="Real ownership and account details used when this branch needs billing assistance."
        items={[
          { label: "Provider entity", value: profile.contractingEntity },
          { label: "Billing administrator", value: payload.owner.name },
          { label: "Billing contact", value: payload.owner.email },
          { label: "Provider ID", value: `PR-${payload.provider.id}` },
          { label: "Branch reference", value: profile.contractorId },
          { label: "Current branch role", value: payload.role_name },
        ]}
        title="Billing responsibility"
      />

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">Billing access matrix</h2>
          <p className="text-muted-foreground text-sm">
            Shows which records this branch login may use without exposing provider-wide financial information.
          </p>
        </div>
        <Table className="border-y">
          <TableCaption className="sr-only">Billing access boundaries for {payload.account.name}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Billing area</TableHead>
              <TableHead>Responsible role</TableHead>
              <TableHead>Data scope</TableHead>
              <TableHead>Current access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accessRows.map((row) => (
              <TableRow key={row.area}>
                <TableCell className="font-medium">{row.area}</TableCell>
                <TableCell className="text-muted-foreground">{row.authority}</TableCell>
                <TableCell className="text-muted-foreground">{row.scope}</TableCell>
                <TableCell>
                  <Badge className="rounded-sm" variant={row.status === "Available" ? "secondary" : "outline"}>
                    {row.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
