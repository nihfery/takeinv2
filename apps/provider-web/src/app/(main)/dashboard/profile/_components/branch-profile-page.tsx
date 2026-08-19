"use client";

import { useCallback, useEffect, useState } from "react";

import { RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BranchProfileEditDialog, type ProfileEditSection } from "./branch-profile-edit-dialog";
import { BillingDetails } from "./profile-billing-details";
import { type BranchProfilePayload, mapBranchProfile, type ProfileRecord } from "./profile-data";
import { ProfileDocuments } from "./profile-documents";
import { EmploymentDetails } from "./profile-employment-details";
import { ProfileHeader } from "./profile-header";
import { ProfileOverview } from "./profile-overview";
import { PersonalDetails } from "./profile-personal-details";
import { ProfileStatusSidebar } from "./profile-status-sidebar";
import { TimeOffDetails } from "./profile-time-off-details";

interface BranchProfileResponse {
  data?: BranchProfilePayload;
  message?: string;
}

type ProfileTab = "overview" | "personal" | "employment" | "compensation" | "time-off" | "documents";

const tabEditConfig: Partial<Record<ProfileTab, { label: string; section: ProfileEditSection }>> = {
  overview: { label: "Edit overview", section: "overview" },
  personal: { label: "Edit contact", section: "contact" },
  employment: { label: "Edit operations", section: "operations" },
  "time-off": { label: "Manage closures", section: "closures" },
};

function ProfileContent({
  activeTab,
  onEdit,
  onTabChange,
  payload,
  profile,
}: Readonly<{
  activeTab: ProfileTab;
  onEdit: (section: ProfileEditSection) => void;
  onTabChange: (tab: ProfileTab) => void;
  payload: BranchProfilePayload;
  profile: ProfileRecord;
}>) {
  const editConfig = tabEditConfig[activeTab];

  return (
    <div className="flex flex-col gap-4 py-4" data-content-padding="false">
      <Breadcrumb className="px-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <span>Dashboard</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span>Provider</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span>Branches</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span>{profile.name}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Profile details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProfileHeader
        editLabel={editConfig?.label ?? "Owner managed"}
        profile={profile}
        onEdit={editConfig ? () => onEdit(editConfig.section) : undefined}
      />

      <Tabs
        className="min-h-0 flex-1 gap-0"
        value={activeTab}
        onValueChange={(value) => onTabChange(value as ProfileTab)}
      >
        <div className="scrollbar-none touch-pan-x overflow-x-auto overscroll-x-contain border-y">
          <TabsList
            className="w-max min-w-full justify-start gap-4 px-4 *:data-[slot=tabs-trigger]:flex-none"
            variant="line"
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personal">Contact</TabsTrigger>
            <TabsTrigger value="employment">Operations</TabsTrigger>
            <TabsTrigger value="compensation">Billing</TabsTrigger>
            <TabsTrigger value="time-off">Closures</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
        </div>

        <div className="px-4 md:px-6">
          <TabsContent value="overview">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_auto_18rem]">
              <div className="py-4 lg:pr-6">
                <ProfileOverview payload={payload} profile={profile} />
              </div>
              <Separator className="hidden lg:block" orientation="vertical" />
              <div className="py-4 lg:pl-6">
                <ProfileStatusSidebar profile={profile} />
              </div>
            </div>
          </TabsContent>

          <TabsContent className="py-4" value="personal">
            <PersonalDetails payload={payload} profile={profile} />
          </TabsContent>

          <TabsContent className="py-4" value="employment">
            <EmploymentDetails payload={payload} profile={profile} />
          </TabsContent>

          <TabsContent className="py-4" value="compensation">
            <BillingDetails payload={payload} profile={profile} />
          </TabsContent>

          <TabsContent className="py-4" value="time-off">
            <TimeOffDetails payload={payload} profile={profile} />
          </TabsContent>

          <TabsContent className="py-4" value="documents">
            <ProfileDocuments payload={payload} profile={profile} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function BranchProfilePage() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [editingSection, setEditingSection] = useState<ProfileEditSection | null>(null);
  const [payload, setPayload] = useState<BranchProfilePayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/provider/branch-profile", {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
        signal,
      });
      const payload = (await response.json().catch(() => null)) as BranchProfileResponse | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.message ?? "The branch profile could not be loaded.");
      }
      setPayload(payload.data);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "The branch profile could not be loaded.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">
        <span className="flex items-center gap-2">
          <Spinner />
          Loading branch profile...
        </span>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto grid min-h-[60vh] w-full max-w-lg place-items-center">
        <Alert variant="destructive">
          <AlertTitle>Branch profile unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error || "The branch profile could not be loaded."}</p>
            <Button size="sm" variant="outline" onClick={() => void loadProfile()}>
              <RefreshCw />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const profile = mapBranchProfile(payload);

  return (
    <>
      <ProfileContent
        activeTab={activeTab}
        payload={payload}
        profile={profile}
        onEdit={setEditingSection}
        onTabChange={setActiveTab}
      />
      {editingSection ? (
        <BranchProfileEditDialog
          open
          payload={payload}
          section={editingSection}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditingSection(null);
          }}
          onSaved={setPayload}
        />
      ) : null}
    </>
  );
}
