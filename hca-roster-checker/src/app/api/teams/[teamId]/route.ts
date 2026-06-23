import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { canAccessTeam, isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

export const dynamic = "force-dynamic";

function normalizeLogoDataUrl(input?: string | null): string | null {
  if (input == null) {
    return null;
  }

  const value = input.trim();
  if (!value) {
    return null;
  }

  const isSupportedDataUrl = /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(value);
  if (!isSupportedDataUrl) {
    throw new Error("Logo must be a PNG, JPG, WEBP, or SVG image.");
  }

  if (value.length > 1_500_000) {
    throw new Error("Logo image is too large. Please keep it under 1 MB.");
  }

  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(_request);
  if (!auth.ok) return auth.response;

  const { teamId } = await params;

  if (!canAccessTeam(auth.session, teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      rosterEntries: {
        where: { status: "ACTIVE" },
        include: { player: true },
        orderBy: { submittedAt: "desc" },
      },
      matchesAsTeamA: {
        include: {
          teamB: true,
          _count: {
            select: {
              matchPlayers: true,
              violations: true,
            },
          },
        },
        orderBy: [{ week: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
      matchesAsTeamB: {
        include: {
          teamA: true,
          _count: {
            select: {
              matchPlayers: true,
              violations: true,
            },
          },
        },
        orderBy: [{ week: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const recentMatches = [
    ...team.matchesAsTeamA.map((match) => ({
      id: match.id,
      week: match.week,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
      playedAt: match.playedAt,
      createdAt: match.createdAt,
      opponent: match.teamB.name,
      sideLabel: match.axisTeamId === teamId ? "Axis" : match.alliesTeamId === teamId ? "Allies" : "Team 1",
      _count: match._count,
    })),
    ...team.matchesAsTeamB.map((match) => ({
      id: match.id,
      week: match.week,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
      playedAt: match.playedAt,
      createdAt: match.createdAt,
      opponent: match.teamA.name,
      sideLabel: match.axisTeamId === teamId ? "Axis" : match.alliesTeamId === teamId ? "Allies" : "Team 2",
      _count: match._count,
    })),
  ]
    .sort((left, right) => {
      if (left.week !== right.week) {
        return right.week - left.week;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, 12)
    .map((match) => ({
      id: match.id,
      week: match.week,
      mapName: match.mapName,
      midpointName: match.midpointName,
      gameUrl: match.gameUrl,
      playedAt: match.playedAt,
      opponent: match.opponent,
      sideLabel: match.sideLabel,
      _count: match._count,
    }));

  return NextResponse.json({
    team: {
      ...team,
      recentMatches,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!canAccessTeam(auth.session, (await params).teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId } = await params;

  const body = (await request.json()) as {
    name?: string;
    tag?: string;
    discordRoleId?: string;
    discordChannelId?: string;
    logoDataUrl?: string | null;
  };

  const isTeamRep = !isOrga(auth.session);
  const updateData: {
    name?: string;
    tag?: string | null;
    discordRoleId?: string | null;
    discordChannelId?: string | null;
    logoDataUrl?: string | null;
  } = {};

  try {
    if (body.logoDataUrl !== undefined) {
      updateData.logoDataUrl = normalizeLogoDataUrl(body.logoDataUrl);
    }
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (!isTeamRep) {
    updateData.name = body.name?.trim();
    updateData.tag = body.tag?.trim() || null;
    updateData.discordRoleId = body.discordRoleId?.trim() || null;
    updateData.discordChannelId = body.discordChannelId?.trim() || null;
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: updateData,
  });

  await createAuditLog({
    action: "TEAM_UPDATED",
    actor: await getActor(request),
    entityType: "Team",
    entityId: team.id,
    details: {
      updatedLogo: body.logoDataUrl !== undefined,
      updatedMetadata: !isTeamRep,
    },
  });

  return NextResponse.json({ team });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          matchesAsTeamA: true,
          matchesAsTeamB: true,
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const scheduledMatches = team._count.matchesAsTeamA + team._count.matchesAsTeamB;
  if (scheduledMatches > 0) {
    return NextResponse.json(
      { error: "Cannot delete a team that is linked to existing matches." },
      { status: 409 },
    );
  }

  await prisma.team.delete({
    where: { id: teamId },
  });

  await createAuditLog({
    action: "TEAM_DELETED",
    actor: await getActor(request),
    entityType: "Team",
    entityId: team.id,
    details: {
      name: team.name,
    },
  });

  return NextResponse.json({ ok: true, deletedTeamId: team.id });
}
