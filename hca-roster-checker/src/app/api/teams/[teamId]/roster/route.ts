import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  if (!canAccessTeam(auth.session, teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  const roster = await prisma.rosterEntry.findMany({
    where: {
      teamId,
      season,
      status: "ACTIVE",
    },
    include: { player: true },
    orderBy: [{ lockedAt: "desc" }, { submittedAt: "desc" }],
  });

  return NextResponse.json({ season, roster });
}
