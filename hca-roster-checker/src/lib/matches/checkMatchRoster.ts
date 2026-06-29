import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { getActiveGamepassIdsByTeam } from "@/lib/matches/rerunMatchViolations";
import { prisma } from "@/lib/prisma";
import type { ParsedMatchStatsRow } from "@/lib/matches/parseMatchStatsCsv";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { isLikelyGamespassId, normalizeSteamId } from "@/lib/steam/steamIds";

export type MatchRosterCheckInput = {
  matchId: string;
  rows: ParsedMatchStatsRow[];
  sourceFileName?: string;
};

export type MatchRosterCheckSummary = {
  totalPlayersFound: number;
  registeredPlayers: number;
  unregisteredPlayers: number;
  violationsCreated: number;
};

function normalizeTeamLabel(value: string): string {
  return value.trim().toLowerCase();
}

function inferExternalSideAssignments({
  rows,
  teamAId,
  teamBId,
  activeRosterByTeam,
}: {
  rows: Array<{
    row: ParsedMatchStatsRow;
    normalized: Extract<ReturnType<typeof normalizeSteamId>, { ok: true }>;
  }>;
  teamAId: string;
  teamBId: string;
  activeRosterByTeam: Map<string, Set<string>>;
}) {
  const sideScores = {
    axis: { teamA: 0, teamB: 0 },
    allies: { teamA: 0, teamB: 0 },
  };

  for (const { row, normalized } of rows) {
    const label = normalizeTeamLabel(row.team);
    const bucket =
      label === "axis" ? sideScores.axis : label === "allies" || label === "allied" ? sideScores.allies : null;

    if (!bucket) {
      continue;
    }

    const steamId64 = normalized.steamId64;
    if (activeRosterByTeam.get(teamAId)?.has(steamId64)) {
      bucket.teamA += 1;
    }
    if (activeRosterByTeam.get(teamBId)?.has(steamId64)) {
      bucket.teamB += 1;
    }
  }

  const sideMap = new Map<string, string>();
  const axisPref =
    sideScores.axis.teamA === sideScores.axis.teamB
      ? null
      : sideScores.axis.teamA > sideScores.axis.teamB
        ? teamAId
        : teamBId;
  const alliesPref =
    sideScores.allies.teamA === sideScores.allies.teamB
      ? null
      : sideScores.allies.teamA > sideScores.allies.teamB
        ? teamAId
        : teamBId;

  if (axisPref && alliesPref && axisPref !== alliesPref) {
    sideMap.set("axis", axisPref);
    sideMap.set("allies", alliesPref);
    sideMap.set("allied", alliesPref);
    return sideMap;
  }

  if (axisPref) {
    sideMap.set("axis", axisPref);
    const opposite = axisPref === teamAId ? teamBId : teamAId;
    sideMap.set("allies", alliesPref ?? opposite);
    sideMap.set("allied", alliesPref ?? opposite);
    return sideMap;
  }

  if (alliesPref) {
    sideMap.set("allies", alliesPref);
    sideMap.set("allied", alliesPref);
    const opposite = alliesPref === teamAId ? teamBId : teamAId;
    sideMap.set("axis", axisPref ?? opposite);
    return sideMap;
  }

  return sideMap;
}

export async function checkMatchRoster({
  matchId,
  rows,
  sourceFileName,
}: MatchRosterCheckInput): Promise<MatchRosterCheckSummary> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: {
        include: {
          rosterEntries: {
            where: { status: "ACTIVE" },
            include: { player: true },
          },
        },
      },
      teamB: {
        include: {
          rosterEntries: {
            where: { status: "ACTIVE" },
            include: { player: true },
          },
        },
      },
    },
  });

  if (!match) {
    throw new Error("Match not found.");
  }

  const teamMap = new Map<string, string>();
  teamMap.set(normalizeTeamLabel(match.teamA.name), match.teamAId);
  teamMap.set(normalizeTeamLabel(match.teamB.name), match.teamBId);

  if (match.teamA.tag) {
    teamMap.set(normalizeTeamLabel(match.teamA.tag), match.teamAId);
  }

  if (match.teamB.tag) {
    teamMap.set(normalizeTeamLabel(match.teamB.tag), match.teamBId);
  }

  const activeRosterByTeam = new Map<string, Set<string>>();
  activeRosterByTeam.set(
    match.teamAId,
    new Set(match.teamA.rosterEntries.map((entry) => entry.player.steamId64)),
  );
  activeRosterByTeam.set(
    match.teamBId,
    new Set(match.teamB.rosterEntries.map((entry) => entry.player.steamId64)),
  );
  const activeGamepassIdsByTeam = await getActiveGamepassIdsByTeam([match.teamAId, match.teamBId], "2026-S1");

  const normalizedRows = rows.map((row) => ({
    row,
    normalized: normalizeSteamId(row.steamId),
  }));
  const validNormalizedRows = normalizedRows.filter(
    (
      value,
    ): value is {
      row: ParsedMatchStatsRow;
      normalized: Extract<ReturnType<typeof normalizeSteamId>, { ok: true }>;
    } => value.normalized.ok,
  );

  let registeredPlayers = 0;
  let unregisteredPlayers = 0;
  let violationsCreated = 0;
  const inferredSideAssignments = inferExternalSideAssignments({
    rows: validNormalizedRows,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    activeRosterByTeam,
  });
  const sideAssignments = new Map(inferredSideAssignments);
  if (match.axisTeamId) {
    sideAssignments.set("axis", match.axisTeamId);
  }
  if (match.alliesTeamId) {
    sideAssignments.set("allies", match.alliesTeamId);
    sideAssignments.set("allied", match.alliesTeamId);
  }

  await prisma.$transaction(async (tx) => {
    const playerIdBySteamId64 = new Map<string, string>();

    for (const normalizedRow of validNormalizedRows) {
      const steamId64 = normalizedRow.normalized.steamId64;
      if (playerIdBySteamId64.has(steamId64)) {
        continue;
      }

      const age = estimateSteamAccountCreatedAt(steamId64);
      const player = await tx.player.upsert({
        where: { steamId64 },
        create: {
          steamId64,
          steamId3: normalizedRow.normalized.steamId3,
          displayName: normalizedRow.row.displayName || null,
          estimatedCreatedAt: age.estimatedCreatedAt,
          accountAgeRisk: age.accountAgeRisk,
        },
        update: {
          steamId3: normalizedRow.normalized.steamId3,
          displayName: normalizedRow.row.displayName || undefined,
          estimatedCreatedAt: age.estimatedCreatedAt,
          accountAgeRisk: age.accountAgeRisk,
        },
        select: {
          id: true,
          steamId64: true,
        },
      });

      playerIdBySteamId64.set(player.steamId64, player.id);
    }

    await tx.matchPlayer.deleteMany({ where: { matchId } });
    await tx.violation.deleteMany({ where: { matchId, type: ViolationType.UNREGISTERED_PLAYER } });

    for (const { row, normalized } of normalizedRows) {
      const normalizedTeamLabel = normalizeTeamLabel(row.team);
      const teamId =
        teamMap.get(normalizedTeamLabel) ||
        sideAssignments.get(normalizedTeamLabel) ||
        (normalizedTeamLabel === "axis"
          ? match.teamAId
          : normalizedTeamLabel === "allies" || normalizedTeamLabel === "allied"
            ? match.teamBId
            : undefined);
      const steamId64 = normalized.ok ? normalized.steamId64 : null;

      if (!teamId) {
        continue;
      }

      await tx.matchPlayer.create({
        data: {
          matchId,
          teamId,
          playerId: steamId64 ? playerIdBySteamId64.get(steamId64) : undefined,
          rawSteamId: row.steamId,
          steamId64: steamId64 || undefined,
          displayName: row.displayName,
          kills: row.kills,
          deaths: row.deaths,
          killsPerMinute: row.kpm,
          deathsPerMinute: row.dpm,
          killDeathRatio: row.kpd,
          timeSeconds: row.timeSeconds,
          role: row.role,
          sourceFileName,
        },
      });

      const teamRoster = activeRosterByTeam.get(teamId) || new Set<string>();
      const isRegistered =
        (steamId64 ? teamRoster.has(steamId64) : false) ||
        (isLikelyGamespassId(row.steamId) && activeGamepassIdsByTeam.get(teamId)?.has(row.steamId.toLowerCase()) === true);

      if (isRegistered) {
        registeredPlayers += 1;
        continue;
      }

      await tx.violation.create({
        data: {
          type: ViolationType.UNREGISTERED_PLAYER,
          severity: ViolationSeverity.HIGH,
          status: ViolationStatus.OPEN,
          teamId,
          playerId: steamId64 ? playerIdBySteamId64.get(steamId64) : undefined,
          matchId,
          rawSteamId: row.steamId,
          details: {
            reason: "Player appeared in match stats but is not on active roster",
            rowNumber: row.rowNumber,
            team: row.team,
          } as Prisma.JsonObject,
        },
      });

      unregisteredPlayers += 1;
      violationsCreated += 1;
    }
  });

  return {
    totalPlayersFound: rows.length,
    registeredPlayers,
    unregisteredPlayers,
    violationsCreated,
  };
}
