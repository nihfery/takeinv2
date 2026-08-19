import type { LucideIcon } from "lucide-react";

import type { QueueTransition } from "../_data/queue-data";

export interface QueueAction {
  transition: QueueTransition;
  label: string;
  description: string;
  destructive?: boolean;
  icon: LucideIcon;
}
