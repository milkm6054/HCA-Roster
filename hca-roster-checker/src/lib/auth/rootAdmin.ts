import type { AuthSession } from "@/lib/auth/session";

export function getRootAdminUsername(): string {
  return (process.env.ROOT_ORGA_USERNAME || process.env.DEFAULT_ADMIN_USERNAME || "MILK").trim();
}

export function isRootOrga(session: AuthSession): boolean {
  return session.role === "HCA_ORGA" && session.username.toLowerCase() === getRootAdminUsername().toLowerCase();
}
