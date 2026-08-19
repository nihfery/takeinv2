"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertCircle, BadgeCheck, CalendarClock, RefreshCw, UsersRound } from "lucide-react";

import { useProviderSession } from "@/components/provider-session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  loadProviderBranches,
  loadProviderServices,
  loadProviderStaff,
  loadServiceCategories,
  type ProviderBranch,
  type ProviderServiceOption,
  type ProviderStaff,
  type ServiceCategory,
} from "../_data/team-data";
import { StaffDirectory } from "./staff-directory";
import { StaffSchedules } from "./staff-schedules";
import { StaffSkills } from "./staff-skills";

const loadingCards = ["staff", "skills", "schedules"];

export function TeamManagement() {
  const { canAccess, scope, user } = useProviderSession();
  const [branches, setBranches] = useState<ProviderBranch[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ProviderServiceOption[]>([]);
  const [staff, setStaff] = useState<ProviderStaff[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const canManageStaff = canAccess("staffs");
  const canManageSkills = canAccess("staff_skills");
  const canManageSchedules = canAccess("staff_schedules");
  const hasTeamAccess = canManageStaff || canManageSkills || canManageSchedules;

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError("");
      const requestSignal = signal ?? new AbortController().signal;
      try {
        const [staffData, branchData, categoryData, serviceData] = await Promise.all([
          loadProviderStaff(requestSignal),
          loadProviderBranches(requestSignal),
          loadServiceCategories(requestSignal),
          loadProviderServices(requestSignal),
        ]);
        setStaff(staffData);
        setBranches(user.branch_id ? branchData.filter((branch) => branch.id === user.branch_id) : branchData);
        setCategories(categoryData.filter((category) => category.status === "active"));
        setServices(serviceData);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Team management data could not be loaded.");
      } finally {
        if (!requestSignal.aborted) setIsLoading(false);
      }
    },
    [user.branch_id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const activeStaff = useMemo(() => staff.filter((member) => member.status === "active").length, [staff]);
  const branchCount = useMemo(() => new Set(staff.map((member) => member.branch_id).filter(Boolean)).size, [staff]);
  const activeServices = useMemo(() => services.filter((service) => service.status === "active").length, [services]);
  let defaultTab = "schedules";
  if (canManageSkills) defaultTab = "skills";
  if (canManageStaff) defaultTab = "staff";

  if (!hasTeamAccess) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Team access is not enabled</AlertTitle>
        <AlertDescription>
          Ask the provider owner to enable staff, staff skills, or staff schedule access for this branch account.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl tracking-tight sm:text-3xl">Team management</h1>
            <Badge variant="outline">{scope.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage staff records, service skills, and regular work schedules for the provider team.
          </p>
        </div>
        <Button className="w-full sm:w-auto" disabled={isLoading} variant="outline" onClick={() => void fetchData()}>
          <RefreshCw className={isLoading ? "animate-spin" : undefined} /> Refresh
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Team data could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void fetchData()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {loadingCards.map((key) => (
              <Skeleton className="h-28" key={key} />
            ))}
          </div>
          <Skeleton className="h-[480px]" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Team members</CardTitle>
                  <CardDescription>{activeStaff} currently active</CardDescription>
                </div>
                <span className="grid size-9 place-items-center rounded-lg border bg-muted/40">
                  <UsersRound className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="font-semibold text-2xl">{staff.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Service catalog</CardTitle>
                  <CardDescription>Available for skill assignment</CardDescription>
                </div>
                <span className="grid size-9 place-items-center rounded-lg border bg-muted/40">
                  <BadgeCheck className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="font-semibold text-2xl">{activeServices}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Branch coverage</CardTitle>
                  <CardDescription>
                    {scope.type === "branch" ? "Current branch scope" : "Locations with staff"}
                  </CardDescription>
                </div>
                <span className="grid size-9 place-items-center rounded-lg border bg-muted/40">
                  <CalendarClock className="size-4" />
                </span>
              </CardHeader>
              <CardContent>
                <p className="font-semibold text-2xl">{branchCount}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs className="min-w-0" defaultValue={defaultTab}>
            <div className="scrollbar-none touch-pan-x overflow-x-auto overscroll-x-contain border-b">
              <TabsList
                className="w-max min-w-full justify-start gap-1 px-1 *:data-[slot=tabs-trigger]:flex-none"
                variant="line"
              >
                <TabsTrigger disabled={!canManageStaff} value="staff">
                  <UsersRound /> Staff
                </TabsTrigger>
                <TabsTrigger disabled={!canManageSkills} value="skills">
                  <BadgeCheck /> Skills
                </TabsTrigger>
                <TabsTrigger disabled={!canManageSchedules} value="schedules">
                  <CalendarClock /> Work schedules
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent className="min-w-0 pt-4" value="staff">
              <StaffDirectory
                branchId={user.branch_id}
                branches={branches}
                categories={categories}
                canManage={canManageStaff}
                onChanged={() => fetchData()}
                staff={staff}
              />
            </TabsContent>
            <TabsContent className="min-w-0 pt-4" value="skills">
              <StaffSkills canManage={canManageSkills} services={services} staff={staff} />
            </TabsContent>
            <TabsContent className="min-w-0 pt-4" value="schedules">
              <StaffSchedules canManage={canManageSchedules} staff={staff} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
