export type ProviderAccountType = "head-office" | "branch";

export interface ProviderUser {
  branch_id: number | null;
  email: string;
  id: number;
  name: string;
  permissions: string[];
  provider_id: number | null;
  provider_role_id: number | null;
  role: "provider";
  status: "active";
  username: string | null;
}

export interface ProviderAccountScope {
  description: string;
  label: string;
  type: ProviderAccountType;
}

function optionalPositiveNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedPermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((permission) => String(permission).trim()).filter(Boolean))];
}

export function parseProviderUser(value: unknown): ProviderUser | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const id = Number(candidate.id);
  const name = String(candidate.name ?? "").trim();
  const email = String(candidate.email ?? "").trim();

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !name ||
    !email ||
    candidate.role !== "provider" ||
    candidate.status !== "active"
  ) {
    return null;
  }

  return {
    branch_id: optionalPositiveNumber(candidate.branch_id),
    email,
    id,
    name,
    permissions: normalizedPermissions(candidate.permissions),
    provider_id: optionalPositiveNumber(candidate.provider_id),
    provider_role_id: optionalPositiveNumber(candidate.provider_role_id),
    role: "provider",
    status: "active",
    username: candidate.username ? String(candidate.username) : null,
  };
}

export function providerAccountScope(user: ProviderUser): ProviderAccountScope {
  if (user.branch_id) {
    return {
      description: "Access is limited to the assigned branch and menu permissions.",
      label: `Branch #${user.branch_id}`,
      type: "branch",
    };
  }

  return {
    description: "Owner access across the provider's business locations.",
    label: "Head Office",
    type: "head-office",
  };
}

export function canAccessProviderPermission(user: ProviderUser, permission: string) {
  if (!user.branch_id) return true;
  if (permission === "customers" && user.permissions.includes("bookings")) return true;
  return user.permissions.includes(permission);
}
