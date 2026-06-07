import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { processLinkedMatchImport } from "@/lib/matches/processLinkedMatchImport";
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

  const body = (await request.json().catch(() => ({}))) as {
    excludedSteamIds?: string[];
  };
  const excludedSteamIds = new Set((body.excludedSteamIds || []).map((value) => value.trim()).filter(Boolean));

  const result = await processLinkedMatchImport({
    matchId,
    gameUrl: match.gameUrl,
    excludedSteamIds: [...excludedSteamIds],
  });
  if (result.status === "needs_streamer_selection") {
    return NextResponse.json(
      {
        error: `This match has ${result.totalPlayersFound} players. Please choose ${result.overflowCount} streamer${result.overflowCount === 1 ? "" : "s"} to exclude before importing.`,
        needsStreamerSelection: true,
        overflowCount: result.overflowCount,
        totalPlayersFound: result.totalPlayersFound,
        suggestedSteamIds: result.suggestedSteamIds,
        candidates: result.candidates,
      },
      { status: 409 },
    );
  }

  await createAuditLog({
    action: "MATCH_STATS_IMPORTED_FROM_LINK",
    actor: await getActor(request),
    entityType: "Match",
    entityId: matchId,
    details: {
      gameUrl: match.gameUrl,
      totalRows: result.totalRows,
      excludedSteamIds: result.excludedSteamIds,
      summary: result.summary,
    },
  });

  await queueNotification({
    type: "MATCH_VIOLATION_ALERT",
    payload: {
      matchId,
      summary: result.summary,
    },
  });

  return NextResponse.json({
    importedFrom: match.gameUrl,
    excludedSteamIds: result.excludedSteamIds,
    summary: result.summary,
  });
}
