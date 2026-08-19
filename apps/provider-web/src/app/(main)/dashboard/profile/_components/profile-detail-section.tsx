import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface ProfileDetailItem {
  description?: ReactNode;
  label: string;
  value: ReactNode;
}

interface ProfileDetailSectionProps {
  badge?: string;
  description?: string;
  items: ProfileDetailItem[];
  title: string;
}

export function ProfileDetailSection({ badge, description, items, title }: ProfileDetailSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading font-medium text-base">{title}</h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {badge ? (
          <Badge className="rounded-sm" variant="outline">
            {badge}
          </Badge>
        ) : null}
      </div>
      <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div className="flex min-w-0 flex-col gap-1" key={item.label}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="break-words text-sm">{item.value || "Not configured"}</dd>
            {item.description ? <dd className="text-muted-foreground text-xs">{item.description}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

interface ProfileMetricCardProps {
  badge?: string;
  description: string;
  title: string;
  value: ReactNode;
}

export function ProfileMetricCard({ badge, description, title, value }: ProfileMetricCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {badge ? (
          <CardAction>
            <Badge className="rounded-sm" variant="outline">
              {badge}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="font-heading font-medium text-xl">{value}</p>
      </CardContent>
    </Card>
  );
}
