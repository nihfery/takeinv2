"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProviderCustomerRow } from "../_data/provider-dashboard";
import { RecentCustomersTable } from "./recent-customers-table/table";

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCustomers(data: ProviderCustomerRow[]) {
  const rows = [
    ["Customer code", "Name", "Email", "Status", "Bookings", "Total spent (minor)", "Last booking"],
    ...data.map((customer) => [
      customer.code,
      customer.name,
      customer.email,
      customer.status,
      customer.bookingCount,
      customer.totalSpentMinor,
      customer.lastBooking || "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "takein-provider-customers.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SubscriberOverview({
  data,
  totalBookings,
  totalCustomers,
}: {
  data: ProviderCustomerRow[];
  totalBookings: number;
  totalCustomers: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-none">{totalCustomers.toLocaleString("en-US")} Customers</CardTitle>
        <CardDescription>
          Customer activity calculated from {totalBookings.toLocaleString("en-US")} provider bookings.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => downloadCustomers(data)} disabled={!data.length}>
            <Download />
            Export
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-0">
        <RecentCustomersTable data={data} />
      </CardContent>
    </Card>
  );
}
