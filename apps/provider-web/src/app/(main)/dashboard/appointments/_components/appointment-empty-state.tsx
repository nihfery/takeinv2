import type { LucideIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface AppointmentEmptyStateProps {
  description: string;
  emptyDescription: string;
  emptyTitle: string;
  icon: LucideIcon;
  title: string;
}

export function AppointmentEmptyState({
  description,
  emptyDescription,
  emptyTitle,
  icon: Icon,
  title,
}: AppointmentEmptyStateProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading font-semibold text-2xl tracking-tight">{title}</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
      </header>

      <Empty className="min-h-[28rem] border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
