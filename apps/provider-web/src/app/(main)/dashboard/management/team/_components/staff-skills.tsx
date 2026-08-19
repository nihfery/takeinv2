"use client";

import { useEffect, useMemo, useState } from "react";

import { BadgeCheck, Save, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import {
  formatMoney,
  loadStaffSkills,
  type ProviderServiceOption,
  type ProviderStaff,
  replaceStaffSkills,
  staffName,
} from "../_data/team-data";

const skillSkeletons = ["skill-1", "skill-2", "skill-3", "skill-4", "skill-5", "skill-6"];

interface StaffSkillsProps {
  canManage: boolean;
  services: ProviderServiceOption[];
  staff: ProviderStaff[];
}

export function StaffSkills({ canManage, services, staff }: StaffSkillsProps) {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(staff[0]?.id ?? null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedStaff = staff.find((member) => member.id === selectedStaffId) ?? null;
  const availableServices = useMemo(() => {
    if (!selectedStaff?.branch_id) return [];
    const query = search.trim().toLowerCase();
    return services.filter((service) => {
      const matchesBranch = service.branch_ids.includes(selectedStaff.branch_id as number);
      const haystack = `${service.title} ${service.category_text}`.toLowerCase();
      return matchesBranch && service.status === "active" && (!query || haystack.includes(query));
    });
  }, [search, selectedStaff, services]);

  useEffect(() => {
    if (!staff.length) {
      setSelectedStaffId(null);
      return;
    }
    if (!selectedStaffId || !staff.some((member) => member.id === selectedStaffId)) setSelectedStaffId(staff[0].id);
  }, [selectedStaffId, staff]);

  useEffect(() => {
    if (!selectedStaffId) {
      setSelectedServiceIds([]);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    loadStaffSkills(selectedStaffId, controller.signal)
      .then((payload) => setSelectedServiceIds(payload.service_ids))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.add({
          description: error instanceof Error ? error.message : "Staff skills could not be loaded.",
          title: "Unable to load skills",
          type: "error",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [selectedStaffId]);

  function toggleService(serviceId: number, checked: boolean) {
    setSelectedServiceIds((current) =>
      checked ? [...new Set([...current, serviceId])] : current.filter((id) => id !== serviceId),
    );
  }

  async function save() {
    if (!selectedStaffId) return;
    setIsSaving(true);
    try {
      const payload = await replaceStaffSkills(selectedStaffId, selectedServiceIds);
      setSelectedServiceIds(payload.service_ids);
      toast.add({
        description: `${payload.service_ids.length} service skills are assigned to ${selectedStaff ? staffName(selectedStaff) : "this staff member"}.`,
        title: "Skills saved",
        type: "success",
      });
    } catch (error) {
      toast.add({
        description: error instanceof Error ? error.message : "Staff skills could not be saved.",
        title: "Unable to save skills",
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
          <CardDescription>Select a staff member to manage service capabilities.</CardDescription>
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
                <p className="p-6 text-center text-muted-foreground text-sm">Add staff before assigning skills.</p>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{selectedStaff ? `${staffName(selectedStaff)}’s skills` : "Service skills"}</CardTitle>
            <CardDescription>Only active services assigned to the staff member’s branch are available.</CardDescription>
          </div>
          <Button disabled={!canManage || !selectedStaff || isLoading || isSaving} onClick={() => void save()}>
            {isSaving ? <Spinner /> : <Save />} Save skills
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <InputGroup className="h-8 w-full sm:w-72">
              <InputGroupAddon align="inline-start">
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search services..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <Badge variant="outline">{selectedServiceIds.length} assigned</Badge>
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {skillSkeletons.map((key) => (
                <Skeleton className="h-20" key={key} />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {availableServices.map((service) => {
                const checked = selectedServiceIds.includes(service.id);
                return (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
                    htmlFor={`staff-skill-${service.id}`}
                    key={service.id}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canManage}
                      id={`staff-skill-${service.id}`}
                      onCheckedChange={(value) => toggleService(service.id, value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="truncate font-medium">{service.title}</span>
                        <Badge variant="secondary">{formatMoney(service.price)}</Badge>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-muted-foreground text-sm">
                        <BadgeCheck className="size-3.5" /> {service.category_text || "Uncategorized"}
                      </span>
                    </span>
                  </label>
                );
              })}
              {selectedStaff && !availableServices.length ? (
                <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                  No active services are available for this staff member’s branch.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
