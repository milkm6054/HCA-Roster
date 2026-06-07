import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { checkMatchRoster } from "@/lib/matches/checkMatchRoster";
import { importExternalMatchStatsFromGameUrl } from "@/lib/matches/importExternalMatchStats";
import { queueNotification } from "@/lib/notifications/notifications";
import { prisma } from "@/lib/prisma";

const MAX_MATCH_PLAYERS = 98;

function buildStreamerCandidates(
  rows: Awaited<ReturnType<typeof importExternalMatchStatsFromGameUrl>>,
  overflowCount: number,
) {
  const candidates = rows
    .map((row) => ({
      steamId: row.steamId,
      displayName: row.displayName || null,
      team: row.team,
      kills: row.kills ?? null,
      deaths: row.deaths ?? null,
      kpd: row.kpd ?? null,
      kpm: row.kpm ?? null,
      dpm: row.dpm ?? null,
      timeSeconds: row.timeSeconds ?? null,
    }))
    .sort((left, right) => {
      const leftKills = left.kills ?? Number.MAX_SAFE_INTEGER;
      const rightKills = right.kills ?? Number.MAX_SAFE_INTEGER;
      if (leftKills !== rightKills) return leftKills - rightKills;

      const leftTime = left.timeSeconds ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.timeSeconds ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;

      return (left.displayName || "").localeCompare(right.displayName || "");
    });

  const suggestedSteamIds = candidates
    .filter((candidate) => (candidate.kills ?? 0) === 0)
    .slice(0, overflowCount)
    .map((candidate) => candidate.steamId);

  return {
    candidates,
    suggestedSteamIds,
  };
}

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

  const rows = await importExternalMatchStatsFromGameUrl({
    gameUrl: match.gameUrl,
  });
  const overflowCount = Math.max(rows.length - MAX_MATCH_PLAYERS, 0);

  if (overflowCount > 0 && excludedSteamIds.size !== overflowCount) {
    const { candidates, suggestedSteamIds } = buildStreamerCandidates(rows, overflowCount);

    return NextResponse.json(
      {
        error: `This match has ${rows.length} players. Please choose ${overflowCount} streamer${overflowCount === 1 ? "" : "s"} to exclude before importing.`,
        needsStreamerSelection: true,
        overflowCount,
        totalPlayersFound: rows.length,
        suggestedSteamIds,
        candidates,
      },
      { status: 409 },
    );
  }

  const filteredRows = rows.filter((row) => !excludedSteamIds.has(row.steamId));

  if (filteredRows.length > MAX_MATCH_PLAYERS) {
    const remainingOverflowCount = filteredRows.length - MAX_MATCH_PLAYERS;
    const { candidates, suggestedSteamIds } = buildStreamerCandidates(filteredRows, remainingOverflowCount);

    return NextResponse.json(
      {
        error: `Import still contains ${filteredRows.length} players after exclusions. Please exclude ${filteredRows.length - MAX_MATCH_PLAYERS} more streamer${filteredRows.length - MAX_MATCH_PLAYERS === 1 ? "" : "s"}.`,
        needsStreamerSelection: true,
        overflowCount: remainingOverflowCount,
        totalPlayersFound: rows.length,
        suggestedSteamIds,
        candidates,
      },
      { status: 409 },
    );
  }

  const summary = await checkMatchRoster({
    matchId,
    rows: filteredRows,
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
      excludedSteamIds: [...excludedSteamIds],
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
    excludedSteamIds: [...excludedSteamIds],
    summary,
  });
}
