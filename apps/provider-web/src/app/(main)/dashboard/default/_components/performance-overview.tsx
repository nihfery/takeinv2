"use client";

import { format, parseISO } from "date-fns";
import { Area, CartesianGrid, ComposedChart, Line, XAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { BookingChartPoint } from "../_data/provider-dashboard";

const chartConfig = {
  scheduledBookings: {
    color: "var(--chart-1)",
    label: "Scheduled",
  },
  walkInBookings: {
    color: "var(--chart-2)",
    label: "Walk-in & queue",
  },
  completedBookings: {
    color: "var(--chart-3)",
    label: "Completed",
  },
} satisfies ChartConfig;

const performancePeriodItems = [{ label: "This month", value: "month" }] as const;
const performanceSegmentItems = [{ label: "All branches", value: "all" }] as const;

export function PerformanceOverview({ data, providerName }: { data: BookingChartPoint[]; providerName: string }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="leading-none">Booking Activity</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">Live monthly activity for {providerName}</span>
          <span className="@[540px]/card:hidden">Current month</span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select defaultValue="month" items={performancePeriodItems}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue placeholder="This month" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Period</SelectLabel>
                {performancePeriodItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select defaultValue="all" items={performanceSegmentItems}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Scope</SelectLabel>
                {performanceSegmentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" disabled>
            Live data
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <ComposedChart data={data} margin={{ top: 0 }}>
            <defs>
              <linearGradient id="fillScheduledBookings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-scheduledBookings)" stopOpacity={0.36} />
                <stop offset="95%" stopColor="var(--color-scheduledBookings)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) =>
                parseISO(value).toLocaleDateString("en-US", { day: "numeric", month: "short" })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  className="w-52"
                  indicator="line"
                  labelFormatter={(value) => format(parseISO(String(value)), "d MMMM yyyy")}
                />
              }
            />
            <ChartLegend verticalAlign="top" content={<ChartLegendContent className="mb-5 justify-end" />} />
            <Area
              dataKey="scheduledBookings"
              type="natural"
              fill="url(#fillScheduledBookings)"
              stroke="var(--color-scheduledBookings)"
              strokeWidth={1.25}
              dot={false}
              fillOpacity={1}
            />
            <Line
              dataKey="walkInBookings"
              type="natural"
              stroke="var(--color-walkInBookings)"
              strokeWidth={1.4}
              dot={false}
            />
            <Line
              dataKey="completedBookings"
              type="natural"
              stroke="var(--color-completedBookings)"
              strokeWidth={1.2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
