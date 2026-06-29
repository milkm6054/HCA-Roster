import { NextResponse } from "next/server";
import { MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { getMidpointsForMap, HLL_MAPS } from "@/lib/matches/hllMaps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const matches = await prisma.match.findMany({
    where: isOrga(auth.session)
      ? undefined
      : {
          OR: [{ teamAId: auth.session.teamId }, { teamBId: auth.session.teamId }],
        },
    orderBy: [{ week: "asc" }, { createdAt: "desc" }],
    include: {
      teamA: true,
      teamB: true,
      _count: {
        select: {
          matchPlayers: true,
          violations: true,
        },
      },
    },
  });

  return NextResponse.json({ matches });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    week?: number;
    teamAId?: string;
    teamBId?: string;
    axisTeamId?: string;
    alliesTeamId?: string;
    mapName?: string;
    midpointName?: string;
    gameUrl?: string;
    playedAt?: string;
  };

  if (!body.week || !body.teamAId || !body.teamBId) {
    return NextResponse.json(
      { error: "week, team 1, and team 2 are required." },
      { status: 400 },
    );
  }

  if (body.teamAId === body.teamBId) {
    return NextResponse.json(
      { error: "teamAId and teamBId must be different." },
      { status: 400 },
    );
  }

  if (body.mapName && !HLL_MAPS.includes(body.mapName as (typeof HLL_MAPS)[number])) {
    return NextResponse.json({ error: "Please choose a valid HLL map." }, { status: 400 });
  }

  const midpointName = body.midpointName?.trim() || null;
  const mapMidpoints = getMidpointsForMap(body.mapName);
  if (body.mapName && midpointName && !mapMidpoints.includes(midpointName)) {
    return NextResponse.json({ error: "Please choose a valid midpoint for the selected map." }, { status: 400 });
  }

  const fixtureTeamIds = new Set([body.teamAId, body.teamBId]);
  const axisTeamId = body.axisTeamId?.trim() || null;
  const alliesTeamId = body.alliesTeamId?.trim() || null;
  if ((axisTeamId && !fixtureTeamIds.has(axisTeamId)) || (alliesTeamId && !fixtureTeamIds.has(alliesTeamId))) {
    return NextResponse.json({ error: "Side assignments must use the selected fixture teams." }, { status: 400 });
  }

  if (axisTeamId && alliesTeamId && axisTeamId === alliesTeamId) {
    return NextResponse.json({ error: "Axis and Allies must be different teams." }, { status: 400 });
  }

  const gameUrl = body.gameUrl?.trim();
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

  const match = await prisma.match.create({
    data: {
      week: Number(body.week),
      teamAId: body.teamAId,
      teamBId: body.teamBId,
      axisTeamId,
      alliesTeamId,
      status: gameUrl ? MatchStatus.READY_TO_IMPORT : MatchStatus.SCHEDULED,
      mapName: body.mapName || null,
      midpointName,
      gameUrl: gameUrl || null,
      playedAt: body.playedAt ? new Date(body.playedAt) : null,
    },
  });

  await createAuditLog({
    action: "MATCH_CREATED",
    actor: await getActor(request),
    entityType: "Match",
    entityId: match.id,
    details: {
      week: match.week,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
      axisTeamId: match.axisTeamId,
      alliesTeamId: match.alliesTeamId,
      status: match.status,
    },
  });

  return NextResponse.json({ match }, { status: 201 });
}
