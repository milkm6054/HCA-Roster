import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function getDefaultAdminConfig() {
  return {
    username: (process.env.DEFAULT_ADMIN_USERNAME || "MILK").trim(),
    password: process.env.DEFAULT_ADMIN_PASSWORD || "C0nn0rSucks!",
    displayName: process.env.DEFAULT_ADMIN_DISPLAY_NAME || "MILK",
  };
}

export async function ensureDefaultAdminAccount(): Promise<void> {
  const cfg = getDefaultAdminConfig();

  const existing = await prisma.user.findUnique({
    where: { username: cfg.username },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(cfg.password, 10);

  await prisma.user.create({
    data: {
      username: cfg.username,
      email: null,
      passwordHash,
      displayName: cfg.displayName,
      role: UserRole.HCA_ORGA,
      isActive: true,
    },
  });
}
