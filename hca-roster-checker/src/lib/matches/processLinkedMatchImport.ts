import { checkMatchRoster, type MatchRosterCheckSummary } from "@/lib/matches/checkMatchRoster";
import { importExternalMatchStatsFromGameUrl } from "@/lib/matches/importExternalMatchStats";

export const MAX_MATCH_PLAYERS = 98;

export type StreamerCandidate = {
  steamId: string;
  displayName: string | null;
  team: string;
  kills: number | null;
  deaths: number | null;
  kpd: number | null;
  kpm: number | null;
  dpm: number | null;
  timeSeconds: number | null;
};

export type LinkedMatchImportResult =
  | {
      status: "needs_streamer_selection";
      overflowCount: number;
      totalPlayersFound: number;
      suggestedSteamIds: string[];
      candidates: StreamerCandidate[];
    }
  | {
      status: "imported";
      totalRows: number;
      excludedSteamIds: string[];
      summary: MatchRosterCheckSummary;
    };

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

export async function processLinkedMatchImport({
  matchId,
  gameUrl,
  excludedSteamIds = [],
}: {
  matchId: string;
  gameUrl: string;
  excludedSteamIds?: string[];
}): Promise<LinkedMatchImportResult> {
  const excludedSteamIdSet = new Set(excludedSteamIds.map((value) => value.trim()).filter(Boolean));
  const rows = await importExternalMatchStatsFromGameUrl({
    gameUrl,
  });
  const overflowCount = Math.max(rows.length - MAX_MATCH_PLAYERS, 0);

  if (overflowCount > 0 && excludedSteamIdSet.size !== overflowCount) {
    const { candidates, suggestedSteamIds } = buildStreamerCandidates(rows, overflowCount);

    return {
      status: "needs_streamer_selection",
      overflowCount,
      totalPlayersFound: rows.length,
      suggestedSteamIds,
      candidates,
    };
  }

  const filteredRows = rows.filter((row) => !excludedSteamIdSet.has(row.steamId));

  if (filteredRows.length > MAX_MATCH_PLAYERS) {
    const remainingOverflowCount = filteredRows.length - MAX_MATCH_PLAYERS;
    const { candidates, suggestedSteamIds } = buildStreamerCandidates(filteredRows, remainingOverflowCount);

    return {
      status: "needs_streamer_selection",
      overflowCount: remainingOverflowCount,
      totalPlayersFound: rows.length,
      suggestedSteamIds,
      candidates,
    };
  }

  const summary = await checkMatchRoster({
    matchId,
    rows: filteredRows,
    sourceFileName: gameUrl,
  });

  return {
    status: "imported",
    totalRows: rows.length,
    excludedSteamIds: [...excludedSteamIdSet],
    summary,
  };
}
