import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { canAccessTeam, isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

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
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({ team });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { teamId } = await params;

  const body = (await request.json()) as {
    name?: string;
    tag?: string;
    discordRoleId?: string;
    discordChannelId?: string;
  };

  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      name: body.name?.trim(),
      tag: body.tag?.trim(),
      discordRoleId: body.discordRoleId?.trim(),
      discordChannelId: body.discordChannelId?.trim(),
    },
  });

  await createAuditLog({
    action: "TEAM_UPDATED",
    actor: await getActor(request),
    entityType: "Team",
    entityId: team.id,
  });

  return NextResponse.json({ team });
}
