"use client";

import { Eye, MoreHorizontal, Pencil, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ProviderService } from "../_data/service-data";

interface ServiceActionsProps {
  service: ProviderService;
  onEdit: (service: ProviderService) => void;
  onToggle: (service: ProviderService) => void;
  onView: (service: ProviderService) => void;
}

export function ServiceActions({ service, onEdit, onToggle, onView }: ServiceActionsProps) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Open actions for ${service.title}`}
              className="size-8 rounded-md text-muted-foreground hover:bg-muted/50"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onView(service)}>
              <Eye />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(service)}>
              <Pencil />
              Edit service
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={service.status === "active" ? "destructive" : "default"}
            onClick={() => onToggle(service)}
          >
            <Power />
            {service.status === "active" ? "Deactivate service" : "Activate service"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
