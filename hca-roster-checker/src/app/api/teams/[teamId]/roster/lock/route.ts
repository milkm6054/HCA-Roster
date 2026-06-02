import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  const result = await prisma.rosterEntry.updateMany({
    where: { teamId, season, status: "ACTIVE" },
    data: { lockedAt: new Date() },
  });

  await createAuditLog({
    action: "ROSTER_LOCKED",
    actor: await getActor(request),
    entityType: "Team",
    entityId: teamId,
    details: { season, count: result.count },
  });

  return NextResponse.json({ updated: result.count });
}
