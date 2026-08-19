interface PersonReference {
  name: string;
  role: string;
  initials: string;
}

export interface BranchProfileIdentity {
  email: string;
  name: string;
  permissions: string[];
  status: string;
  user_id: string;
  username: string;
}

export interface BranchProfileBranch {
  address: string | null;
  branch_name: string;
  branch_type: string;
  city_id: string | null;
  country_id: string | null;
  created_at: string;
  description: string;
  email: string | null;
  holidays: string[];
  id: number;
  opened_at: string | null;
  phone_code: string;
  phone_number: string | null;
  provider_id: number;
  state_id: string | null;
  status: string;
  timezone: string;
  updated_at: string;
  working_days: string[];
  working_end_hour: string;
  working_start_hour: string;
  zip_code: string | null;
}

export interface BranchProfileProvider {
  category: string | null;
  created_at: string;
  display_name: string;
  document_status: string;
  id: number;
  status: string;
  updated_at: string;
}

export interface BranchProfileDocumentPayload {
  available: boolean;
  category: string;
  id: string;
  is_restricted: boolean;
  name: string;
  status: string;
  updated_at: string;
}

export interface BranchProfilePayload {
  account: BranchProfileIdentity;
  branch: BranchProfileBranch;
  completion_percentage: number;
  documents: BranchProfileDocumentPayload[];
  owner: BranchProfileIdentity;
  provider: BranchProfileProvider;
  role_name: string;
}

export interface ProfileDocument {
  id: string;
  name: string;
  category: string;
  updatedAt: string;
  status: string;
  isRestricted: boolean;
  isAvailable: boolean;
}

export interface ProfileRecord {
  name: string;
  preferredName: string;
  legalName: string;
  pronouns: string;
  initials: string;
  avatar: string;
  completionPercentage: number;
  verified: boolean;
  verificationStatus: string;
  engagementStatus: string;
  jobTitle: string;
  jobLevel: string;
  department: string;
  team: string;
  currentProject: string;
  workEmail: string;
  personalEmail: string;
  workPhone: string;
  workplace: string;
  timeZone: string;
  contractorId: string;
  startDate: string;
  engagementLength: string;
  employmentType: string;
  weeklyHours: string;
  schedule: string;
  contractingEntity: string;
  noticePeriod: string;
  dateOfBirth: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  manager: PersonReference;
  bio: string;
  leavePolicy: string;
  annualLeaveAllowance: string;
  remainingLeave: string;
  carriedOverLeave: string;
  usedLeave: string;
  scheduledLeave: string;
  pendingLeaveRequests: string;
  leaveYear: string;
  nextLeave: string;
  lastWorkingDay: string;
  updatedBy: string;
  updatedAt: string;
  documents: ProfileDocument[];
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export function formatProfileDate(value: string | null | undefined, fallback = "Not configured") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
}

export function titleCaseProfileValue(value: string | null | undefined, fallback = "Not configured") {
  if (!value) return fallback;
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function joinProfileAddress(branch: BranchProfileBranch) {
  return [branch.address, branch.city_id, branch.state_id, branch.country_id, branch.zip_code]
    .filter(Boolean)
    .join(", ");
}

export function formatProfilePhone(branch: BranchProfileBranch) {
  if (!branch.phone_number) return "Not configured";
  return `${branch.phone_code} ${branch.phone_number}`.trim();
}

function minutes(value: string) {
  const [hours = "0", minute = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minute);
}

export function profileWeeklyHours(branch: BranchProfileBranch) {
  const dailyMinutes = Math.max(0, minutes(branch.working_end_hour) - minutes(branch.working_start_hour));
  const totalHours = Math.round((dailyMinutes * branch.working_days.length) / 60);
  return totalHours > 0 ? `${totalHours} hours` : "Not configured";
}

function operatingDuration(openedAt: string | null) {
  if (!openedAt) return "Not configured";
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) return "Not configured";
  const now = new Date();
  const months = Math.max(
    0,
    (now.getUTCFullYear() - opened.getUTCFullYear()) * 12 + now.getUTCMonth() - opened.getUTCMonth(),
  );
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years === 0) return `${Math.max(1, remainder)} months`;
  return remainder ? `${years} years, ${remainder} months` : `${years} years`;
}

export function nextProfileClosure(holidays: string[]) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const next = holidays
    .map((holiday) => new Date(`${holiday}T00:00:00Z`))
    .filter((holiday) => !Number.isNaN(holiday.getTime()) && holiday >= now)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  return next ? dateFormatter.format(next) : "No closure scheduled";
}

export function mapBranchProfile(payload: BranchProfilePayload): ProfileRecord {
  const { account, branch, documents, owner, provider } = payload;
  const address = joinProfileAddress(branch) || "Not configured";
  const openedAt = branch.opened_at ?? branch.created_at;
  const futureHolidays = branch.holidays.filter((holiday) => new Date(`${holiday}T00:00:00Z`) >= new Date());
  const pastHolidays = branch.holidays.length - futureHolidays.length;
  const branchDays = branch.working_days.map((day) => titleCaseProfileValue(day)).join(", ") || "Not configured";
  const operatingHours =
    branch.working_start_hour && branch.working_end_hour
      ? `${branch.working_start_hour}–${branch.working_end_hour}`
      : "Not configured";

  return {
    name: branch.branch_name,
    preferredName: branch.branch_name,
    legalName: account.name,
    pronouns: account.username || "Not configured",
    initials: initials(branch.branch_name),
    avatar: "",
    completionPercentage: Math.max(0, Math.min(100, payload.completion_percentage)),
    verified: provider.document_status === "verified" && branch.status === "active",
    verificationStatus: titleCaseProfileValue(provider.document_status),
    engagementStatus: titleCaseProfileValue(branch.status),
    jobTitle: payload.role_name,
    jobLevel: titleCaseProfileValue(branch.branch_type),
    department: titleCaseProfileValue(provider.category, "Beauty & Wellness"),
    team: branch.city_id ?? "Not configured",
    currentProject: address,
    workEmail: account.email,
    personalEmail: branch.email ?? account.email,
    workPhone: formatProfilePhone(branch),
    workplace: titleCaseProfileValue(branch.branch_type),
    timeZone: branch.timezone || "Asia/Jakarta",
    contractorId: `BR-${branch.id}`,
    startDate: formatProfileDate(openedAt),
    engagementLength: operatingDuration(openedAt),
    employmentType: "Provider Branch",
    weeklyHours: profileWeeklyHours(branch),
    schedule: `${branchDays} · ${operatingHours}`,
    contractingEntity: provider.display_name || owner.name,
    noticePeriod: payload.role_name,
    dateOfBirth: formatProfileDate(branch.created_at),
    address,
    emergencyContact: owner.name,
    emergencyPhone: owner.email,
    manager: {
      name: owner.name,
      role: "Provider owner",
      initials: initials(owner.name),
    },
    bio: branch.description || `${branch.branch_name} is an official branch of ${provider.display_name || owner.name}.`,
    leavePolicy: "Branch operating calendar",
    annualLeaveAllowance: `${branch.holidays.length} scheduled closures`,
    remainingLeave: `${futureHolidays.length} upcoming closures`,
    carriedOverLeave: "Not applicable",
    usedLeave: `${Math.max(0, pastHolidays)} completed closures`,
    scheduledLeave: `${futureHolidays.length} scheduled`,
    pendingLeaveRequests: "0",
    leaveYear: `${new Date().getUTCFullYear()} operating calendar`,
    nextLeave: nextProfileClosure(branch.holidays),
    lastWorkingDay: operatingHours,
    updatedBy: account.name,
    updatedAt: formatProfileDate(branch.updated_at),
    documents: documents.map((document) => ({
      id: document.id,
      name: document.name,
      category: document.category,
      updatedAt: shortDateFormatter.format(new Date(document.updated_at)),
      status: titleCaseProfileValue(document.status),
      isRestricted: document.is_restricted,
      isAvailable: document.available,
    })),
  };
}
