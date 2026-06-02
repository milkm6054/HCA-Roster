import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function getDefaultAdminConfig() {
  return {
    email: (process.env.DEFAULT_ADMIN_EMAIL || "admin@hca.local").toLowerCase().trim(),
    password: process.env.DEFAULT_ADMIN_PASSWORD || "AdminPass123!",
    displayName: process.env.DEFAULT_ADMIN_DISPLAY_NAME || "Default HCA Admin",
  };
}

export async function ensureDefaultAdminAccount(): Promise<void> {
  const cfg = getDefaultAdminConfig();

  const existing = await prisma.user.findUnique({
    where: { email: cfg.email },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(cfg.password, 10);

  await prisma.user.create({
    data: {
      email: cfg.email,
      passwordHash,
      displayName: cfg.displayName,
      role: UserRole.HCA_ORGA,
      isActive: true,
    },
  });
}
