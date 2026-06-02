import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { getActor } from "@/lib/auth/getActor";

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          rosterEntries: true,
          violations: true,
        },
      },
    },
  });

  return NextResponse.json({ teams });
}

export async function POST(request: Request) {
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
    actor: await getActor(),
    entityType: "Team",
    entityId: team.id,
    details: { name: team.name },
  });

  return NextResponse.json({ team }, { status: 201 });
}
