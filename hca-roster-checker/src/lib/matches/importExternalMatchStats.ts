import type { ParsedMatchStatsRow } from "@/lib/matches/parseMatchStatsCsv";

type ExternalScoreboardPlayer = {
  player_id?: string;
  player?: string;
  kills?: number;
  deaths?: number;
  kills_per_minute?: number;
  deaths_per_minute?: number;
  kill_death_ratio?: number;
  time_seconds?: number;
  team?: {
    side?: string;
  };
};

type ExternalScoreboardResponse = {
  result?: {
    player_stats?: ExternalScoreboardPlayer[];
  };
  error?: string | null;
};

export async function importExternalMatchStatsFromGameUrl({
  gameUrl,
  axisTeamName,
  alliesTeamName,
}: {
  gameUrl: string;
  axisTeamName: string;
  alliesTeamName: string;
}): Promise<ParsedMatchStatsRow[]> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(gameUrl);
  } catch {
    throw new Error("Game link must be a valid URL.");
  }

  const matchId = parsedUrl.pathname.match(/\/games\/(\d+)\/?$/)?.[1];
  if (!matchId) {
    throw new Error("Game link must look like /games/{id}.");
  }

  const scoreboardUrl = new URL(`/api/get_map_scoreboard?map_id=${matchId}`, parsedUrl.origin);
  const response = await fetch(scoreboardUrl.toString(), {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch external match stats.");
  }

  const payload = (await response.json()) as ExternalScoreboardResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  const playerStats = payload.result?.player_stats || [];

  return playerStats
    .filter((player) => (player.time_seconds || 0) > 15)
    .filter((player) => Boolean(player.player_id))
    .map((player, index) => ({
      team: player.team?.side === "axis" ? axisTeamName : alliesTeamName,
      steamId: player.player_id || "",
      displayName: player.player?.trim() || undefined,
      kills: player.kills,
      deaths: player.deaths,
      kpd: player.kill_death_ratio,
      kpm: player.kills_per_minute,
      dpm: player.deaths_per_minute,
      timeSeconds: player.time_seconds,
      rowNumber: index + 2,
    }));
}
