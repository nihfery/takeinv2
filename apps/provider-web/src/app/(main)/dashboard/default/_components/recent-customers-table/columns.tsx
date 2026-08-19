"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Subscribe } from "@tanstack/react-table";
import { differenceInCalendarDays, endOfToday, format, parseISO } from "date-fns";
import { CircleCheckIcon, Repeat2, Sparkles, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataTableFeatures } from "@/lib/data-table-features";

import type { RecentCustomerRow } from "./schema";

function statusLabel(status: string) {
  return status ? `${status.charAt(0).toUpperCase()}${status.slice(1).replaceAll("_", " ")}` : "Unknown";
}

function currency(minor: number, code: string) {
  return new Intl.NumberFormat("id-ID", {
    currency: code || "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(minor / 100);
}

export const recentCustomersColumns: ColumnDef<DataTableFeatures, RecentCustomerRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Subscribe source={table.atoms.rowSelection}>
          {() => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
              aria-label="Select all customers on this page"
            />
          )}
        </Subscribe>
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Subscribe source={row.table.atoms.rowSelection} selector={(selection) => Boolean(selection?.[row.id])}>
          {(checked) => (
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => row.toggleSelected(value)}
              aria-label={`Select ${row.original.name}`}
            />
          )}
        </Subscribe>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Customer",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium text-sm leading-none">{row.original.name}</span>
          <span className="truncate text-muted-foreground text-xs leading-none">{row.original.code}</span>
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "search",
    accessorFn: (row) => `${row.code} ${row.name} ${row.email}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {row.original.status === "active" ? (
          <CircleCheckIcon className="fill-green-500 stroke-primary-foreground" />
        ) : null}
        {statusLabel(row.original.status)}
      </Badge>
    ),
  },
  {
    id: "activity",
    accessorFn: (row) => (row.bookingCount > 1 ? "Returning" : "New"),
    header: "Activity",
    filterFn: "equalsString",
    cell: ({ row }) => {
      const returning = row.original.bookingCount > 1;
      return (
        <Badge variant="outline" className="px-1.5 text-muted-foreground">
          {returning ? <Repeat2 /> : <Sparkles />}
          {returning ? "Returning" : "New"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "bookingCount",
    header: "Bookings",
    cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.bookingCount}</span>,
  },
  {
    accessorKey: "totalSpentMinor",
    header: "Total spent",
    cell: ({ row }) => (
      <span className="font-medium text-sm tabular-nums">
        {currency(row.original.totalSpentMinor, row.original.currency)}
      </span>
    ),
  },
  {
    id: "lastBookingWindow",
    accessorFn: (row) => {
      if (!row.lastBooking) return [];
      const daysSinceBooking = differenceInCalendarDays(endOfToday(), parseISO(row.lastBooking));
      if (daysSinceBooking <= 30) return ["30", "90"];
      if (daysSinceBooking <= 90) return ["90"];
      return [];
    },
    filterFn: "arrIncludes",
    enableHiding: true,
  },
  {
    accessorKey: "lastBooking",
    header: "Last booking",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.lastBooking ? format(parseISO(row.original.lastBooking), "do MMMM yyyy") : "No booking date"}
      </span>
    ),
  },
];
