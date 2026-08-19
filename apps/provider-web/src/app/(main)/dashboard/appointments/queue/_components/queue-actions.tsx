"use client";

import { Check, Eye, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ProviderBooking } from "../../booking/_data/booking-data";
import type { QueueAction } from "./queue-action-data";

interface QueueActionsProps {
  actions: QueueAction[];
  booking: ProviderBooking;
  onStatusAction: (booking: ProviderBooking, action: QueueAction) => void;
  onView: (booking: ProviderBooking) => void;
}

export function QueueActions({ actions, booking, onStatusAction, onView }: QueueActionsProps) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Open actions for ${booking.booking_code}`}
              className="size-8 rounded-md text-muted-foreground hover:bg-muted/50"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onView(booking)}>
              <Eye />
              View details
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {actions.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {actions.map((action) => {
                  const ActionIcon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={action.transition}
                      onClick={() => onStatusAction(booking, action)}
                      variant={action.destructive ? "destructive" : "default"}
                    >
                      <ActionIcon />
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <Check />
                Status is final
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
