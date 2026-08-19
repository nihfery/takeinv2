import type { BranchProfilePayload, ProfileRecord } from "./profile-data";
import { ProfileDetailSection } from "./profile-detail-section";
import { ProfileSectionHeader } from "./profile-section-header";

interface PersonalDetailsProps {
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}

export function PersonalDetails({ payload, profile }: PersonalDetailsProps) {
  const { branch } = payload;

  return (
    <div className="flex flex-col gap-6">
      <ProfileSectionHeader
        description="Customer-facing email and telephone details for this branch."
        title="Contact information"
      />

      <ProfileDetailSection
        badge="Customer-facing"
        description="These are the only contact channels displayed for the branch."
        items={[
          { label: "Branch email", value: branch.email ? branch.email : "Not configured" },
          { label: "Phone country code", value: branch.phone_code || "Not configured" },
          { label: "Phone number", value: branch.phone_number ? branch.phone_number : "Not configured" },
          { label: "Formatted phone", value: profile.workPhone },
        ]}
        title="Public contact channels"
      />
    </div>
  );
}
