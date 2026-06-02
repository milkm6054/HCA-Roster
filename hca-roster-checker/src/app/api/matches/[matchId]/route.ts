import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(_request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: true,
      teamB: true,
      matchPlayers: {
        include: {
          player: true,
          team: true,
        },
        orderBy: { createdAt: "desc" },
      },
      violations: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  return NextResponse.json({ match });
}
