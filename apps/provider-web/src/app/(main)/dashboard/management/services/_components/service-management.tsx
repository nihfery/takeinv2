"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  CalendarClock,
  ListFilter,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ToggleRight,
  X,
} from "lucide-react";

import { useProviderSession } from "@/components/provider-session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

import {
  formatServiceMoney,
  loadProviderBranches,
  loadProviderServices,
  loadServiceCategories,
  type ProviderBranch,
  type ProviderService,
  type ServiceCategory,
  serviceLabel,
  toggleProviderService,
} from "../_data/service-data";
import { ServiceActions } from "./service-actions";
import { ServiceDetailsSheet } from "./service-details-sheet";
import { ServiceFormDialog } from "./service-form-dialog";

const pageSize = 10;
const metricSkeletons = ["total", "active", "queue", "average"];
const rowSkeletons = ["service-1", "service-2", "service-3", "service-4", "service-5"];
const serviceStatusLabels: Record<string, string> = {
  active: "Active",
  all: "All statuses",
  inactive: "Inactive",
};

function MetricCard({
  description,
  icon: Icon,
  title,
  value,
}: Readonly<{
  description: string;
  icon: typeof Sparkles;
  title: string;
  value: string;
}>) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="font-medium text-sm">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="font-semibold text-2xl tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricSkeletons.map((key) => (
          <Card key={key}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {rowSkeletons.map((key) => (
            <Skeleton className="h-12 w-full" key={key} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ServiceManagement() {
  const { canAccess, scope, user } = useProviderSession();
  const [branches, setBranches] = useState<ProviderBranch[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedService, setSelectedService] = useState<ProviderService | null>(null);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [status, setStatus] = useState("all");
  const [toggleService, setToggleService] = useState<ProviderService | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [viewService, setViewService] = useState<ProviderService | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const hasAccess = canAccess("services");

  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError("");
      const requestSignal = signal ?? new AbortController().signal;
      try {
        const [serviceData, branchData, categoryData] = await Promise.all([
          loadProviderServices(requestSignal),
          user.branch_id ? Promise.resolve([] as ProviderBranch[]) : loadProviderBranches(requestSignal),
          loadServiceCategories(requestSignal),
        ]);
        setServices(Array.isArray(serviceData) ? serviceData : []);
        setBranches(Array.isArray(branchData) ? branchData : []);
        setCategories(Array.isArray(categoryData) ? categoryData : []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Service data could not be loaded.");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [user.branch_id],
  );

  useEffect(() => {
    if (!hasAccess) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, hasAccess]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return services.filter((service) => {
      const matchesSearch =
        !term ||
        [service.title, service.category_text, service.code, service.description]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase().includes(term));
      const matchesStatus = status === "all" || service.status === status;
      const matchesBranch = selectedBranch === "all" || service.branch_ids.includes(Number(selectedBranch));
      return matchesSearch && matchesStatus && matchesBranch;
    });
  }, [search, selectedBranch, services, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleServices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeCount = services.filter((service) => service.status === "active").length;
  const queueCount = services.filter((service) => service.is_queue_enabled).length;
  const averageDuration = services.length
    ? Math.round(services.reduce((total, service) => total + service.estimated_duration, 0) / services.length)
    : 0;

  const saveService = useCallback((saved: ProviderService, created: boolean) => {
    setServices((current) =>
      created ? [saved, ...current] : current.map((service) => (service.id === saved.id ? saved : service)),
    );
    setSelectedService(saved);
    setViewService((current) => (current?.id === saved.id ? saved : current));
  }, []);

  const confirmToggle = async () => {
    if (!toggleService || isToggling) return;
    setIsToggling(true);
    try {
      const updated = await toggleProviderService(toggleService.id);
      setServices((current) => current.map((service) => (service.id === updated.id ? updated : service)));
      setViewService((current) => (current?.id === updated.id ? updated : current));
      setToggleService(null);
      toast.add({
        description: `${updated.title} is now ${updated.status}.`,
        title: updated.status === "active" ? "Service activated" : "Service deactivated",
        type: "success",
      });
    } catch (toggleError) {
      toast.add({
        description: toggleError instanceof Error ? toggleError.message : "Service status could not be changed.",
        title: "Status update failed",
        type: "error",
      });
    } finally {
      setIsToggling(false);
    }
  };

  const openCreate = () => {
    setSelectedService(null);
    setFormOpen(true);
  };
  const openEdit = (service: ProviderService) => {
    setSelectedService(service);
    setFormOpen(true);
  };

  if (!hasAccess) {
    return (
      <div className="min-w-0 space-y-6">
        <PageHeader isLoading={false} onAdd={() => undefined} onRefresh={() => undefined} scopeLabel={scope.label} />
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Service management unavailable</AlertTitle>
          <AlertDescription>This branch account does not have the services permission.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        isLoading={isLoading}
        onAdd={openCreate}
        onRefresh={() => void fetchData()}
        scopeLabel={scope.label}
      />

      {isLoading && services.length === 0 ? (
        <LoadingState />
      ) : (
        <>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Could not load services</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button size="sm" variant="outline" onClick={() => void fetchData()}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description={scope.label}
              icon={Sparkles}
              title="Total services"
              value={String(services.length)}
            />
            <MetricCard
              description="Available for booking"
              icon={ToggleRight}
              title="Active services"
              value={String(activeCount)}
            />
            <MetricCard
              description="Supports walk-in queue"
              icon={ListFilter}
              title="Queue enabled"
              value={String(queueCount)}
            />
            <MetricCard
              description="Across the service catalog"
              icon={CalendarClock}
              title="Average duration"
              value={`${averageDuration} min`}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
              <CardTitle className="text-xl leading-none">Service catalog</CardTitle>
              <CardDescription>
                Showing {filtered.length} of {services.length} services for {scope.label}.
              </CardDescription>
              <CardAction className="col-start-1 row-start-auto w-full justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-72 md:justify-self-end">
                <InputGroup className="h-8">
                  <InputGroupAddon align="inline-start">
                    <Search className="size-3.5" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Search services"
                    id="service-search"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search services..."
                    value={search}
                  />
                </InputGroup>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="flex flex-wrap items-center gap-2 px-4">
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger aria-label="Filter service status" className="w-full sm:w-36" size="sm">
                    <SelectValue>{serviceStatusLabels[status] ?? "All statuses"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {scope.type === "head-office" ? (
                  <Select
                    value={selectedBranch}
                    onValueChange={(value) => {
                      setSelectedBranch(value ?? "all");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger aria-label="Filter service branch" className="w-full sm:w-48" size="sm">
                      <SelectValue>
                        {selectedBranch === "all"
                          ? "All branches"
                          : (branches.find((branch) => String(branch.id) === selectedBranch)?.branch_name ??
                            "All branches")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value="all">All branches</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={String(branch.id)}>
                            {branch.branch_name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : null}
                {search || status !== "all" || selectedBranch !== "all" ? (
                  <Button
                    className="w-full sm:w-auto"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                      setSelectedBranch("all");
                    }}
                  >
                    <X />
                    Clear filters
                  </Button>
                ) : null}
              </div>

              {visibleServices.length === 0 ? (
                <div className="px-4">
                  <Empty className="min-h-60 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Sparkles />
                      </EmptyMedia>
                      <EmptyTitle>No services found</EmptyTitle>
                      <EmptyDescription>
                        {services.length
                          ? "No service matches the current filters."
                          : "Add the first bookable service for this branch."}
                      </EmptyDescription>
                      {!services.length ? (
                        <Button onClick={openCreate}>
                          <Plus />
                          Add service
                        </Button>
                      ) : null}
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px] **:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                    <TableCaption className="sr-only">Services available to {scope.label}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Booking modes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleServices.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>
                            <p className="font-medium">{service.title}</p>
                            <p className="text-muted-foreground text-xs">{service.code || `Service #${service.id}`}</p>
                          </TableCell>
                          <TableCell>{service.category_text}</TableCell>
                          <TableCell>
                            <p className="font-medium">{formatServiceMoney(service.price)}</p>
                            <p className="text-muted-foreground text-xs">{serviceLabel(service.price_type)}</p>
                          </TableCell>
                          <TableCell>{service.estimated_duration} min</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {service.is_scheduled_enabled ? <Badge variant="outline">Scheduled</Badge> : null}
                              {service.is_queue_enabled ? <Badge variant="outline">Queue</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                aria-label={`${service.status === "active" ? "Deactivate" : "Activate"} ${service.title}`}
                                checked={service.status === "active"}
                                size="sm"
                                onCheckedChange={() => setToggleService(service)}
                              />
                              <Badge variant={service.status === "active" ? "default" : "secondary"}>
                                {serviceLabel(service.status)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ServiceActions
                              service={service}
                              onEdit={openEdit}
                              onToggle={setToggleService}
                              onView={(current) => {
                                setViewService(current);
                                setViewOpen(true);
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {filtered.length > pageSize ? (
                <div className="flex items-center justify-between gap-4 border-t px-4 pt-4 text-sm">
                  <p className="text-muted-foreground">
                    Page {currentPage} of {pageCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={currentPage <= 1}
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((value) => value - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={currentPage >= pageCount}
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((value) => value + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <ServiceFormDialog
        branches={branches.filter((branch) => branch.status === "active")}
        categories={categories}
        fixedBranchId={user.branch_id}
        open={formOpen}
        service={selectedService}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setSelectedService(null);
        }}
        onSaved={saveService}
      />
      <ServiceDetailsSheet
        open={viewOpen}
        service={viewService}
        onEdit={openEdit}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setViewService(null);
        }}
      />
      <AlertDialog
        open={Boolean(toggleService)}
        onOpenChange={(open) => {
          if (!open && !isToggling) setToggleService(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <ToggleRight />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {toggleService?.status === "active" ? "Deactivate service?" : "Activate service?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleService?.status === "active"
                ? `${toggleService.title} will no longer be available for new customer bookings.`
                : `${toggleService?.title ?? "This service"} will become available for customer bookings.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isToggling} onClick={() => void confirmToggle()}>
              {isToggling ? <Spinner /> : null}
              {toggleService?.status === "active" ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageHeader({
  isLoading,
  onAdd,
  onRefresh,
  scopeLabel,
}: Readonly<{ isLoading: boolean; onAdd: () => void; onRefresh: () => void; scopeLabel: string }>) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Services</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Manage pricing, duration, booking modes, and availability for {scopeLabel}.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Button className="w-full sm:w-auto" disabled={isLoading} variant="outline" onClick={onRefresh}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
        <Button className="w-full sm:w-auto" onClick={onAdd}>
          <Plus />
          Add service
        </Button>
      </div>
    </div>
  );
}
