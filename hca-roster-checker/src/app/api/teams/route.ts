import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const teams = await prisma.team.findMany({
    where: isOrga(auth.session)
      ? undefined
      : {
          id: auth.session.teamId,
        },
    orderBy: { name: "asc" },
    include: {
      rosterEntries: {
        select: {
          id: true,
        },
      },
      violations: {
        where: {
          status: "OPEN",
          NOT: {
            type: "NEW_ACCOUNT",
          },
        },
        select: {
          id: true,
          rawSteamId: true,
        },
      },
    },
  });

  return NextResponse.json({
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      _count: {
        rosterEntries: team.rosterEntries.length,
        violations: team.violations.filter((violation) => !isLikelyGamespassId(violation.rawSteamId || "")).length,
      },
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    tag?: string;
    discordRoleId?: string;
    discordChannelId?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      name: body.name.trim(),
      tag: body.tag?.trim() || null,
      discordRoleId: body.discordRoleId?.trim() || null,
      discordChannelId: body.discordChannelId?.trim() || null,
    },
  });

  await createAuditLog({
    action: "TEAM_CREATED",
    actor: await getActor(request),
    entityType: "Team",
    entityId: team.id,
    details: { name: team.name },
  });

  return NextResponse.json({ team }, { status: 201 });
}
