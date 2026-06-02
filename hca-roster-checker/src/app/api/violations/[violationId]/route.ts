import { NextResponse } from "next/server";
import { ViolationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ violationId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { violationId } = await params;
  const body = (await request.json()) as {
    status?: ViolationStatus;
  };

  if (!body.status || !Object.values(ViolationStatus).includes(body.status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
  }

  const violation = await prisma.violation.update({
    where: { id: violationId },
    data: { status: body.status },
  });

  await createAuditLog({
    action: "VIOLATION_STATUS_UPDATED",
    actor: await getActor(request),
    entityType: "Violation",
    entityId: violation.id,
    details: { status: body.status },
  });

  return NextResponse.json({ violation });
}
