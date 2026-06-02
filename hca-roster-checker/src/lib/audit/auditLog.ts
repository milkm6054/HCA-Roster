import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type CreateAuditLogInput = {
  action: string;
  actor?: string;
  entityType: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
};

export async function createAuditLog({
  action,
  actor,
  entityType,
  entityId,
  details,
}: CreateAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      actor,
      entityType,
      entityId,
      details: details ?? undefined,
    },
  });
}
