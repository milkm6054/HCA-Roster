import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { getActor } from "@/lib/auth/getActor";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  const result = await prisma.rosterEntry.updateMany({
    where: { teamId, season, status: "ACTIVE" },
    data: { lockedAt: null },
  });

  await createAuditLog({
    action: "ROSTER_UNLOCKED",
    actor: await getActor(),
    entityType: "Team",
    entityId: teamId,
    details: { season, count: result.count },
  });

  return NextResponse.json({ updated: result.count });
}
