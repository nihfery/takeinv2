import { LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface ProfileSectionHeaderProps {
  description: string;
  locked?: boolean;
  title: string;
}

export function ProfileSectionHeader({ description, locked = false, title }: ProfileSectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-lg">{title}</h2>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </div>
      {locked ? (
        <Badge className="rounded-sm" variant="outline">
          <LockKeyhole data-icon="inline-start" />
          Owner managed
        </Badge>
      ) : null}
    </div>
  );
}
