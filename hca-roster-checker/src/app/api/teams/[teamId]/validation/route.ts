import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

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

  const violations = await prisma.violation.findMany({
    where: {
      teamId,
      status: "OPEN",
      NOT: {
        type: "NEW_ACCOUNT",
      },
    },
    include: {
      player: true,
      match: {
        include: {
          teamA: true,
          teamB: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    violations: violations.filter((violation) => !isLikelyGamespassId(violation.rawSteamId || "")),
  });
}
