import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { canAccessTeam, isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

export const dynamic = "force-dynamic";

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
