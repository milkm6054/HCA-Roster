import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { createAuditLog } from "@/lib/audit/auditLog";
import { getActor } from "@/lib/auth/getActor";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(_request);
  if (!auth.ok) return auth.response;

  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: true,
      teamB: true,
      matchPlayers: {
        include: {
          player: true,
          team: true,
        },
        orderBy: { createdAt: "desc" },
      },
      violations: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  if (
    !isOrga(auth.session) &&
    auth.session.teamId !== match.teamAId &&
    auth.session.teamId !== match.teamBId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ match });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: true,
      teamB: true,
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.violation.deleteMany({
      where: { matchId },
    }),
    prisma.match.delete({
      where: { id: matchId },
    }),
  ]);

  await createAuditLog({
    action: "MATCH_DELETED",
    actor: await getActor(request),
    entityType: "Match",
    entityId: match.id,
    details: {
      week: match.week,
      teamA: match.teamA.name,
      teamB: match.teamB.name,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
    },
  });

  return NextResponse.json({ ok: true, deletedMatchId: match.id });
}
