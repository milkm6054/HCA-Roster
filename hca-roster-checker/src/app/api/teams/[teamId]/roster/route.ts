import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  const roster = await prisma.rosterEntry.findMany({
    where: {
      teamId,
      season,
      status: "ACTIVE",
    },
    include: { player: true },
    orderBy: [{ lockedAt: "desc" }, { submittedAt: "desc" }],
  });

  return NextResponse.json({ season, roster });
}
