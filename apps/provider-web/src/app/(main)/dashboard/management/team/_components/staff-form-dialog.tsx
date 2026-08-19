"use client";

import { type FormEvent, useEffect, useState } from "react";

import { format, parseISO } from "date-fns";
import { CalendarIcon, Save, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import {
  createProviderStaff,
  type ProviderBranch,
  type ProviderStaff,
  type ServiceCategory,
  type StaffInput,
  updateProviderStaff,
} from "../_data/team-data";

const emptyForm: StaffInput = {
  address: "",
  bio: "",
  branch_id: 0,
  category_id: 0,
  city_id: "",
  country_code: "+62",
  country_id: "ID",
  date_of_birth: "",
  email: "",
  first_name: "",
  gender: "",
  last_name: "",
  phone_number: "",
  postal_code: "",
  role: "Staff",
  state_id: "",
  status: "active",
  username: "",
};

function staffToInput(staff: ProviderStaff): StaffInput {
  return {
    address: staff.address ?? "",
    bio: staff.bio ?? "",
    branch_id: staff.branch_id ?? 0,
    category_id: staff.category_id ?? 0,
    city_id: staff.city_id ?? "",
    country_code: staff.country_code ?? "+62",
    country_id: staff.country_id ?? "ID",
    date_of_birth: staff.date_of_birth ?? "",
    email: staff.email,
    first_name: staff.first_name,
    gender: staff.gender ?? "",
    last_name: staff.last_name,
    phone_number: staff.phone_number ?? "",
    postal_code: staff.postal_code ?? "",
    role: staff.role || "Staff",
    state_id: staff.state_id ?? "",
    status: staff.status,
    username: staff.username ?? "",
  };
}

function StaffDatePicker({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const [open, setOpen] = useState(false);
  const parsedDate = value ? parseISO(value) : undefined;
  const selectedDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-between text-left font-normal data-[empty=true]:text-muted-foreground"
            data-empty={!selectedDate}
            id="staff-birth-date"
            type="button"
            variant="outline"
          />
        }
      >
        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
        <CalendarIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          captionLayout="dropdown"
          defaultMonth={selectedDate}
          endMonth={new Date()}
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
          selected={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}

interface StaffFormDialogProps {
  branchId: number | null;
  branches: ProviderBranch[];
  categories: ServiceCategory[];
  onOpenChange: (open: boolean) => void;
  onSaved: (staff: ProviderStaff) => void;
  open: boolean;
  staff: ProviderStaff | null;
}

export function StaffFormDialog({
  branchId,
  branches,
  categories,
  onOpenChange,
  onSaved,
  open,
  staff,
}: StaffFormDialogProps) {
  const [form, setForm] = useState<StaffInput>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const selectedBranchName = branches.find((branch) => branch.id === form.branch_id)?.branch_name;
  const selectedCategoryName = categories.find((category) => category.id === form.category_id)?.name;
  const genderLabel = form.gender ? `${form.gender.charAt(0).toUpperCase()}${form.gender.slice(1)}` : undefined;
  const statusLabel = form.status === "active" ? "Active" : "Inactive";

  useEffect(() => {
    if (!open) return;
    const initial = staff ? staffToInput(staff) : { ...emptyForm, branch_id: branchId ?? branches[0]?.id ?? 0 };
    setForm(initial);
  }, [branchId, branches, open, staff]);

  function setField<K extends keyof StaffInput>(field: K, value: StaffInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      toast.add({
        description: "First name, last name, and email are required.",
        title: "Check staff details",
        type: "error",
      });
      return;
    }
    if (form.branch_id <= 0 || form.category_id <= 0) {
      toast.add({ description: "Select a branch and staff category.", title: "Check staff assignment", type: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const saved = staff ? await updateProviderStaff(staff.id, form) : await createProviderStaff(form);
      onSaved(saved);
      onOpenChange(false);
      toast.add({
        description: `${saved.first_name} ${saved.last_name} is ready in the team directory.`,
        title: staff ? "Staff updated" : "Staff added",
        type: "success",
      });
    } catch (error) {
      toast.add({
        description: error instanceof Error ? error.message : "Staff details could not be saved.",
        title: "Unable to save staff",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-h-[780px] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>{staff ? "Edit team member" : "Add team member"}</DialogTitle>
          <DialogDescription>
            Maintain the staff identity and branch assignment used by bookings, skills, and work schedules.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" id="staff-member-form" onSubmit={submit}>
          <ScrollArea className="min-h-0 flex-1">
            <FieldGroup className="grid gap-4 p-5 pb-8 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="staff-first-name">First name</FieldLabel>
                <Input
                  id="staff-first-name"
                  value={form.first_name}
                  onChange={(event) => setField("first_name", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-last-name">Last name</FieldLabel>
                <Input
                  id="staff-last-name"
                  value={form.last_name}
                  onChange={(event) => setField("last_name", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-email">Email</FieldLabel>
                <Input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-username">Username</FieldLabel>
                <Input
                  id="staff-username"
                  value={form.username}
                  onChange={(event) => setField("username", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-branch">Branch</FieldLabel>
                <Select
                  disabled={branchId !== null}
                  value={form.branch_id > 0 ? String(form.branch_id) : null}
                  onValueChange={(value) => setField("branch_id", Number(value))}
                >
                  <SelectTrigger className="w-full" id="staff-branch">
                    <SelectValue placeholder="Select branch">{selectedBranchName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {branch.branch_name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-category">Staff category</FieldLabel>
                <Select
                  value={form.category_id > 0 ? String(form.category_id) : null}
                  onValueChange={(value) => setField("category_id", Number(value))}
                >
                  <SelectTrigger className="w-full" id="staff-category">
                    <SelectValue placeholder="Select category">{selectedCategoryName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={String(category.id)}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>Used to group staff expertise before assigning exact services.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-role">Role</FieldLabel>
                <Input id="staff-role" value={form.role} onChange={(event) => setField("role", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-status">Status</FieldLabel>
                <Select
                  value={form.status}
                  onValueChange={(value) => setField("status", value as StaffInput["status"])}
                >
                  <SelectTrigger className="w-full" id="staff-status">
                    <SelectValue>{statusLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-country-code">Country code</FieldLabel>
                <Input
                  id="staff-country-code"
                  value={form.country_code}
                  onChange={(event) => setField("country_code", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-phone">Phone number</FieldLabel>
                <Input
                  id="staff-phone"
                  value={form.phone_number}
                  onChange={(event) => setField("phone_number", event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-gender">Gender</FieldLabel>
                <Select value={form.gender || null} onValueChange={(value) => setField("gender", value ?? "")}>
                  <SelectTrigger className="w-full" id="staff-gender">
                    <SelectValue placeholder="Not specified">{genderLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="staff-birth-date">Date of birth</FieldLabel>
                <StaffDatePicker value={form.date_of_birth} onChange={(value) => setField("date_of_birth", value)} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="staff-address">Address</FieldLabel>
                <Input
                  id="staff-address"
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="staff-bio">Notes</FieldLabel>
                <Textarea
                  className="min-h-24 resize-none"
                  id="staff-bio"
                  value={form.bio}
                  onChange={(event) => setField("bio", event.target.value)}
                />
              </Field>
            </FieldGroup>
          </ScrollArea>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 px-5 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? <Spinner /> : null}
              {!isSaving && staff ? <Save /> : null}
              {!isSaving && !staff ? <UserPlus /> : null}
              {staff ? "Save changes" : "Add staff"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
