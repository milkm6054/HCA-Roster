import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { checkMatchRoster } from "@/lib/matches/checkMatchRoster";
import { importExternalMatchStatsFromGameUrl } from "@/lib/matches/importExternalMatchStats";
import { queueNotification } from "@/lib/notifications/notifications";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(request);
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
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  if (!match.gameUrl) {
    return NextResponse.json({ error: "This match does not have a game link yet." }, { status: 400 });
  }

  const rows = await importExternalMatchStatsFromGameUrl({
    gameUrl: match.gameUrl,
  });

  const summary = await checkMatchRoster({
    matchId,
    rows,
    sourceFileName: match.gameUrl,
  });

  await createAuditLog({
    action: "MATCH_STATS_IMPORTED_FROM_LINK",
    actor: await getActor(request),
    entityType: "Match",
    entityId: matchId,
    details: {
      gameUrl: match.gameUrl,
      totalRows: rows.length,
      summary,
    },
  });

  await queueNotification({
    type: "MATCH_VIOLATION_ALERT",
    payload: {
      matchId,
      summary,
    },
  });

  return NextResponse.json({
    importedFrom: match.gameUrl,
    summary,
  });
}
