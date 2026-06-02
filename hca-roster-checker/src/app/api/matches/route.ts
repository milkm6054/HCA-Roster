import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    actor: await getActor(request),
    entityType: "Match",
    entityId: match.id,
  });

  return NextResponse.json({ match }, { status: 201 });
}
