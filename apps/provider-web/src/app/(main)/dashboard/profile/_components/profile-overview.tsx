import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

import type { BranchProfilePayload, ProfileRecord } from "./profile-data";
import { ProfileDetailSection, ProfileMetricCard } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

interface ProfileOverviewProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function ProfileOverview({ payload, profile }: ProfileOverviewProps) {
  const availableDocuments = profile.documents.filter((document) => document.isAvailable).length;

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Manage the branch identity, description, service model, and opening date shown across the provider dashboard."
        title="Overview information"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProfileMetricCard
          badge={profile.completionPercentage === 100 ? "Complete" : "Action needed"}
          description="Required branch information"
          title="Profile completion"
          value={`${profile.completionPercentage}%`}
        />
        <ProfileMetricCard
          badge={profile.verificationStatus}
          description="Branch and provider verification"
          title="Record status"
          value={profile.engagementStatus}
        />
        <ProfileMetricCard
          description={`${payload.branch.working_days.length} operating days each week`}
          title="Weekly coverage"
          value={profile.weeklyHours}
        />
        <ProfileMetricCard
          description="Available verification records"
          title="Documents"
          value={`${availableDocuments}/${profile.documents.length}`}
        />
      </div>

      <Progress value={profile.completionPercentage}>
        <ProgressLabel>Branch profile readiness</ProgressLabel>
        <ProgressValue>{(_formattedValue, value) => `${value ?? 0}%`}</ProgressValue>
      </Progress>

      <ProfileDetailSection
        description={profile.bio}
        items={[
          { label: "Branch ID", value: profile.contractorId },
          { label: "Branch status", value: profile.engagementStatus },
          { label: "Verification status", value: profile.verificationStatus },
          { label: "Opened date", value: profile.startDate },
          { label: "Operating for", value: profile.engagementLength },
          { label: "Provider entity", value: profile.contractingEntity },
        ]}
        title="Branch snapshot"
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">Provider ownership</h2>
          <p className="text-muted-foreground text-sm">
            This branch belongs to the provider entity below. Ownership and billing authority remain at provider level.
          </p>
        </div>
        <Item variant="outline">
          <ItemMedia>
            <Avatar size="lg">
              <AvatarFallback>{profile.manager.initials}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{profile.manager.name}</ItemTitle>
            <ItemDescription>{profile.emergencyPhone}</ItemDescription>
          </ItemContent>
          <ItemContent>
            <ItemTitle>{profile.contractingEntity}</ItemTitle>
            <ItemDescription>{profile.manager.role}</ItemDescription>
          </ItemContent>
        </Item>
      </section>
    </div>
  );
}
