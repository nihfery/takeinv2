import { FileText, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { type BranchProfilePayload, formatProfileDate, type ProfileRecord } from "./profile-data";
import { ProfileDetailSection, ProfileMetricCard } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

interface ProfileDocumentsProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function ProfileDocuments({ payload, profile }: ProfileDocumentsProps) {
  const available = profile.documents.filter((document) => document.isAvailable).length;
  const verified = profile.documents.filter((document) => document.status.toLowerCase() === "verified").length;
  const restricted = profile.documents.filter((document) => document.isRestricted).length;

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Review document availability and verification status for the provider entity behind this branch."
        title="Document information"
        locked
      />

      <Alert>
        <LockKeyhole />
        <AlertTitle>Documents are managed by the provider owner</AlertTitle>
        <AlertDescription>
          The branch account can review requirement and verification status, while upload, replacement, approval, and
          download access remain protected at provider level.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProfileMetricCard
          description="Tracked verification requirements"
          title="Requirements"
          value={profile.documents.length}
        />
        <ProfileMetricCard description="Files currently attached" title="Available files" value={available} />
        <ProfileMetricCard description="Requirements approved" title="Verified" value={verified} />
        <ProfileMetricCard description="Provider-owner-only records" title="Restricted" value={restricted} />
      </div>

      <ProfileDetailSection
        badge="Provider controlled"
        description="Verification context shared with this branch without exposing protected document files."
        items={[
          { label: "Provider entity", value: profile.contractingEntity },
          { label: "Provider verification", value: profile.verificationStatus },
          { label: "Branch status", value: profile.engagementStatus },
          { label: "Document administrator", value: payload.owner.name },
          { label: "Administrator email", value: payload.owner.email },
          { label: "Provider record updated", value: formatProfileDate(payload.provider.updated_at) },
        ]}
        title="Verification ownership"
      />

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">Document requirements</h2>
          <p className="text-muted-foreground text-sm">
            Availability, verification, and access status for records associated with this provider branch.
          </p>
        </div>
        {profile.documents.length ? (
          <Table className="border-y">
            <TableCaption className="sr-only">
              Verification documents associated with {payload.branch.branch_name}
            </TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.documents.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className="font-medium">{document.name}</TableCell>
                  <TableCell className="text-muted-foreground">{document.category}</TableCell>
                  <TableCell>
                    <Badge className="rounded-sm" variant={document.isAvailable ? "secondary" : "outline"}>
                      {document.isAvailable ? "Available" : "Missing"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="rounded-sm" variant="outline">
                      {document.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{document.updatedAt}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {document.isRestricted ? "Provider owner only" : "Branch visible"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No document requirements returned</EmptyTitle>
              <EmptyDescription>
                The provider record does not currently expose any document requirements to this branch account.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}
