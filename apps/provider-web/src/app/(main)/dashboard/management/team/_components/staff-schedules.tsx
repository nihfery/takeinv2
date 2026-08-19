"use client";

import { useEffect, useMemo, useState } from "react";

import { CalendarClock, Clock3, Save, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

import {
  loadStaffSchedules,
  type ProviderStaff,
  replaceStaffSchedules,
  type StaffScheduleInput,
  staffName,
} from "../_data/team-data";

const weekdays = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

const scheduleTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

const dayAliases: Record<string, string> = {
  fri: "friday",
  friday: "friday",
  jumat: "friday",
  "5": "friday",
  mon: "monday",
  monday: "monday",
  senin: "monday",
  "1": "monday",
  sat: "saturday",
  saturday: "saturday",
  sabtu: "saturday",
  "6": "saturday",
  sun: "sunday",
  sunday: "sunday",
  minggu: "sunday",
  "0": "sunday",
  thu: "thursday",
  thursday: "thursday",
  kamis: "thursday",
  "4": "thursday",
  tue: "tuesday",
  tuesday: "tuesday",
  selasa: "tuesday",
  "2": "tuesday",
  wed: "wednesday",
  wednesday: "wednesday",
  rabu: "wednesday",
  "3": "wednesday",
};

function defaultSchedules(): StaffScheduleInput[] {
  return weekdays.map((day) => ({ day_of_week: day.key, end_time: "17:00", is_available: true, start_time: "09:00" }));
}

function timeValue(value: string) {
  return value.slice(0, 5);
}

function timeChoices(currentValue: string) {
  const normalizedValue = timeValue(currentValue);
  if (scheduleTimeOptions.includes(normalizedValue)) return scheduleTimeOptions;
  return [...scheduleTimeOptions, normalizedValue].sort();
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

interface StaffSchedulesProps {
  canManage: boolean;
  staff: ProviderStaff[];
}

export function StaffSchedules({ canManage, staff }: StaffSchedulesProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(staff[0]?.id ?? null);
  const [schedules, setSchedules] = useState<StaffScheduleInput[]>(defaultSchedules);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectedStaff = staff.find((member) => member.id === selectedStaffId) ?? null;

  useEffect(() => {
    if (!staff.length) {
      setSelectedStaffId(null);
      return;
    }
    if (!selectedStaffId || !staff.some((member) => member.id === selectedStaffId)) setSelectedStaffId(staff[0].id);
  }, [selectedStaffId, staff]);

  useEffect(() => {
    if (!selectedStaffId) {
      setSchedules(defaultSchedules());
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    loadStaffSchedules(selectedStaffId, controller.signal)
      .then((items) => {
        const byDay = new Map(
          items.map((item) => [dayAliases[item.day_of_week.toLowerCase()] ?? item.day_of_week.toLowerCase(), item]),
        );
        setSchedules(
          weekdays.map((day) => {
            const item = byDay.get(day.key);
            return item
              ? {
                  day_of_week: day.key,
                  end_time: timeValue(item.end_time),
                  is_available: item.is_available,
                  start_time: timeValue(item.start_time),
                }
              : { day_of_week: day.key, end_time: "17:00", is_available: false, start_time: "09:00" };
          }),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.add({
          description: error instanceof Error ? error.message : "Work schedule could not be loaded.",
          title: "Unable to load schedule",
          type: "error",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [selectedStaffId]);

  const weeklyHours = useMemo(
    () =>
      schedules.reduce((total, schedule) => {
        if (!schedule.is_available) return total;
        return total + Math.max(0, minutes(schedule.end_time) - minutes(schedule.start_time));
      }, 0) / 60,
    [schedules],
  );

  function updateDay(day: string, changes: Partial<StaffScheduleInput>) {
    setSchedules((current) =>
      current.map((schedule) => (schedule.day_of_week === day ? { ...schedule, ...changes } : schedule)),
    );
  }

  async function save() {
    if (!selectedStaffId) return;
    const invalidDay = schedules.find((schedule) => minutes(schedule.end_time) <= minutes(schedule.start_time));
    if (invalidDay) {
      toast.add({
        description: "End time must be later than start time for every day.",
        title: "Check working hours",
        type: "error",
      });
      return;
    }
    setIsSaving(true);
    try {
      const saved = await replaceStaffSchedules(selectedStaffId, schedules);
      toast.add({
        description: `${saved.filter((item) => item.is_available).length} working days are configured for ${selectedStaff ? staffName(selectedStaff) : "this staff member"}.`,
        title: "Schedule saved",
        type: "success",
      });
    } catch (error) {
      toast.add({
        description: error instanceof Error ? error.message : "Work schedule could not be saved.",
        title: "Unable to save schedule",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader className="border-b">
          <CardTitle>Team members</CardTitle>
          <CardDescription>Select a staff member to configure regular working hours.</CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-72 lg:h-[520px]">
            <div className="space-y-1 pr-2">
              {staff.map((member) => (
                <Button
                  className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
                  key={member.id}
                  variant={selectedStaffId === member.id ? "secondary" : "ghost"}
                  onClick={() => setSelectedStaffId(member.id)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background">
                    <UserRound className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{staffName(member)}</span>
                    <span className="block truncate font-normal text-muted-foreground text-xs">
                      {member.role || "Staff"}
                    </span>
                  </span>
                </Button>
              ))}
              {!staff.length ? (
                <p className="p-6 text-center text-muted-foreground text-sm">Add staff before setting schedules.</p>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{selectedStaff ? `${staffName(selectedStaff)}’s work schedule` : "Work schedule"}</CardTitle>
            <CardDescription>Configure regular availability used by calendar and booking capacity.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="outline">
              <CalendarClock /> {weeklyHours.toFixed(weeklyHours % 1 ? 1 : 0)} hours/week
            </Badge>
            <Button
              className="w-full sm:w-auto"
              disabled={!canManage || !selectedStaff || isLoading || isSaving}
              onClick={() => void save()}
            >
              {isSaving ? <Spinner /> : <Save />} Save schedule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {weekdays.map((day) => (
                <Skeleton className="h-16" key={day.key} />
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {weekdays.map((day) => {
                const schedule = schedules.find((item) => item.day_of_week === day.key) ?? defaultSchedules()[0];
                return (
                  <div
                    className="grid min-w-0 gap-3 p-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center"
                    key={day.key}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={schedule.is_available}
                        disabled={!canManage}
                        onCheckedChange={(checked) => updateDay(day.key, { is_available: checked })}
                      />
                      <span className="font-medium">{day.label}</span>
                    </div>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:grid-cols-[8rem_auto_8rem_minmax(0,1fr)]">
                      <Select
                        disabled={!canManage || !schedule.is_available}
                        value={schedule.start_time}
                        onValueChange={(value) => {
                          if (value) updateDay(day.key, { start_time: value });
                        }}
                      >
                        <SelectTrigger aria-label={`${day.label} start time`} className="w-full min-w-0">
                          <Clock3 className="text-muted-foreground" />
                          <SelectValue>
                            <span className="font-medium tabular-nums">{schedule.start_time}</span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" alignItemWithTrigger={false} className="max-h-56!">
                          <SelectGroup>
                            <SelectLabel>Start time</SelectLabel>
                            {timeChoices(schedule.start_time).map((time) => (
                              <SelectItem key={time} value={time}>
                                <span className="tabular-nums">{time}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground text-sm">to</span>
                      <Select
                        disabled={!canManage || !schedule.is_available}
                        value={schedule.end_time}
                        onValueChange={(value) => {
                          if (value) updateDay(day.key, { end_time: value });
                        }}
                      >
                        <SelectTrigger aria-label={`${day.label} end time`} className="w-full min-w-0">
                          <Clock3 className="text-muted-foreground" />
                          <SelectValue>
                            <span className="font-medium tabular-nums">{schedule.end_time}</span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" alignItemWithTrigger={false} className="max-h-56!">
                          <SelectGroup>
                            <SelectLabel>End time</SelectLabel>
                            {timeChoices(schedule.end_time).map((time) => (
                              <SelectItem key={time} value={time}>
                                <span className="tabular-nums">{time}</span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <span className="ml-auto hidden text-muted-foreground text-sm md:inline">
                        {schedule.is_available
                          ? `${Math.max(0, minutes(schedule.end_time) - minutes(schedule.start_time)) / 60} hours`
                          : "Day off"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
