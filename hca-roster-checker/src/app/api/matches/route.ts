import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { getActor } from "@/lib/auth/getActor";

export async function GET() {
  const matches = await prisma.match.findMany({
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
  const body = (await request.json()) as {
    week?: number;
    teamAId?: string;
    teamBId?: string;
    playedAt?: string;
  };

  if (!body.week || !body.teamAId || !body.teamBId) {
    return NextResponse.json(
      { error: "week, teamAId, and teamBId are required." },
      { status: 400 },
    );
  }

  if (body.teamAId === body.teamBId) {
    return NextResponse.json(
      { error: "teamAId and teamBId must be different." },
      { status: 400 },
    );
  }

  const match = await prisma.match.create({
    data: {
      week: Number(body.week),
      teamAId: body.teamAId,
      teamBId: body.teamBId,
      playedAt: body.playedAt ? new Date(body.playedAt) : null,
    },
  });

  await createAuditLog({
    action: "MATCH_CREATED",
    actor: await getActor(),
    entityType: "Match",
    entityId: match.id,
  });

  return NextResponse.json({ match }, { status: 201 });
}
