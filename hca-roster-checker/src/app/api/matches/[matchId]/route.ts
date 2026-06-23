import { NextResponse } from "next/server";
import { MatchStatus } from "@prisma/client";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { createAuditLog } from "@/lib/audit/auditLog";
import { getActor } from "@/lib/auth/getActor";
import { HLL_MAPS } from "@/lib/matches/hllMaps";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId } = await params;
  const body = (await request.json()) as {
    axisTeamId?: string | null;
    alliesTeamId?: string | null;
    mapName?: string | null;
    midpointName?: string | null;
    gameUrl?: string | null;
    playedAt?: string | null;
  };

  const existingMatch = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: true,
      teamB: true,
      _count: {
        select: {
          matchPlayers: true,
        },
      },
    },
  });

  if (!existingMatch) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const fixtureTeamIds = new Set([existingMatch.teamAId, existingMatch.teamBId]);
  const axisTeamId = body.axisTeamId?.trim() || null;
  const alliesTeamId = body.alliesTeamId?.trim() || null;
  const mapName = body.mapName?.trim() || null;
  const midpointName = body.midpointName?.trim() || null;
  const gameUrl = body.gameUrl?.trim() || null;

  if ((axisTeamId && !fixtureTeamIds.has(axisTeamId)) || (alliesTeamId && !fixtureTeamIds.has(alliesTeamId))) {
    return NextResponse.json({ error: "Side assignments must use this match's two fixture teams." }, { status: 400 });
  }

  if (axisTeamId && alliesTeamId && axisTeamId === alliesTeamId) {
    return NextResponse.json({ error: "Axis and Allies must be different teams." }, { status: 400 });
  }

  if (gameUrl && (!axisTeamId || !alliesTeamId)) {
    return NextResponse.json({ error: "Choose Axis and Allies before adding a stats link." }, { status: 400 });
  }

  if (mapName && !HLL_MAPS.includes(mapName as (typeof HLL_MAPS)[number])) {
    return NextResponse.json({ error: "Please choose a valid HLL map." }, { status: 400 });
  }

  if (gameUrl) {
    try {
      const parsedUrl = new URL(gameUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("invalid");
      }
    } catch {
      return NextResponse.json({ error: "Game link must be a valid http or https URL." }, { status: 400 });
    }
  }

  const status =
    existingMatch._count.matchPlayers > 0
      ? MatchStatus.IMPORTED
      : gameUrl
        ? MatchStatus.READY_TO_IMPORT
        : MatchStatus.SCHEDULED;
  const playedAt = body.playedAt ? new Date(body.playedAt) : gameUrl ? existingMatch.playedAt || new Date() : null;

  const match = await prisma.match.update({
    where: { id: matchId },
    data: {
      axisTeamId,
      alliesTeamId,
      mapName,
      midpointName,
      gameUrl,
      playedAt,
      status,
    },
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

  await createAuditLog({
    action: "MATCH_UPDATED",
    actor: await getActor(request),
    entityType: "Match",
    entityId: match.id,
    details: {
      week: match.week,
      teamA: existingMatch.teamA.name,
      teamB: existingMatch.teamB.name,
      axisTeamId: match.axisTeamId,
      alliesTeamId: match.alliesTeamId,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
      status: match.status,
    },
  });

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
    select: {
      id: true,
      week: true,
      mapName: true,
      midpointName: true,
      gameUrl: true,
      teamA: {
        select: {
          name: true,
        },
      },
      teamB: {
        select: {
          name: true,
        },
      },
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
