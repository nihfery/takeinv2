"use client";

import { useMemo, useState } from "react";

import { MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

import {
  deleteProviderStaff,
  type ProviderBranch,
  type ProviderStaff,
  type ServiceCategory,
  staffName,
} from "../_data/team-data";
import { StaffFormDialog } from "./staff-form-dialog";

interface StaffDirectoryProps {
  branchId: number | null;
  branches: ProviderBranch[];
  categories: ServiceCategory[];
  canManage: boolean;
  onChanged: () => Promise<void>;
  staff: ProviderStaff[];
}

export function StaffDirectory({ branchId, branches, categories, canManage, onChanged, staff }: StaffDirectoryProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<ProviderStaff | null>(null);
  const [deleteStaff, setDeleteStaff] = useState<ProviderStaff | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const visibleStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesStatus = status === "all" || member.status === status;
      const haystack = `${staffName(member)} ${member.email} ${member.role} ${member.phone_number ?? ""}`.toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [search, staff, status]);

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.branch_name])), [branches]);
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  async function confirmDelete() {
    if (!deleteStaff) return;
    setIsDeleting(true);
    try {
      await deleteProviderStaff(deleteStaff.id);
      toast.add({
        description: `${staffName(deleteStaff)} was removed from the team.`,
        title: "Staff removed",
        type: "success",
      });
      setDeleteStaff(null);
      await onChanged();
    } catch (error) {
      toast.add({
        description: error instanceof Error ? error.message : "Staff member could not be removed.",
        title: "Unable to remove staff",
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle>Staff directory</CardTitle>
          <CardDescription>Manage staff records and the branch where each team member works.</CardDescription>
          <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap gap-2 md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto">
            <InputGroup className="h-8 w-full md:w-64">
              <InputGroupAddon align="inline-start">
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search team..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" alignItemWithTrigger={false}>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="w-full sm:w-auto"
              disabled={!canManage}
              onClick={() => {
                setSelectedStaff(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Add staff
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-[760px] **:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
            <TableHeader>
              <TableRow>
                <TableHead>Team member</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleStaff.length ? (
                visibleStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/50">
                          <UserRound className="size-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{staffName(member)}</p>
                          <p className="truncate text-muted-foreground text-sm">{member.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.branch_id
                        ? (branchNames.get(member.branch_id) ?? `Branch #${member.branch_id}`)
                        : "Unassigned"}
                    </TableCell>
                    <TableCell>
                      {member.category_id
                        ? (categoryNames.get(member.category_id) ?? `Category #${member.category_id}`)
                        : "Not set"}
                    </TableCell>
                    <TableCell>{member.role || "Staff"}</TableCell>
                    <TableCell>
                      <Badge variant={member.status === "active" ? "default" : "secondary"}>
                        {member.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button aria-label={`Actions for ${staffName(member)}`} size="icon-sm" variant="ghost" />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              disabled={!canManage}
                              onClick={() => {
                                setSelectedStaff(member);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil /> Edit staff
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!canManage}
                            variant="destructive"
                            onClick={() => setDeleteStaff(member)}
                          >
                            <Trash2 /> Remove staff
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-32 text-center text-muted-foreground" colSpan={6}>
                    No team members match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-3 text-muted-foreground text-sm">
            Showing {visibleStaff.length} of {staff.length} team members
          </div>
        </CardContent>
      </Card>

      <StaffFormDialog
        branchId={branchId}
        branches={branches}
        categories={categories}
        onOpenChange={setFormOpen}
        onSaved={() => void onChanged()}
        open={formOpen}
        staff={selectedStaff}
      />

      <AlertDialog open={deleteStaff !== null} onOpenChange={(open) => !open && setDeleteStaff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteStaff
                ? `${staffName(deleteStaff)} and their skill and schedule assignments will be removed.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} variant="destructive" onClick={() => void confirmDelete()}>
              {isDeleting ? <Spinner /> : <Trash2 />} Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
