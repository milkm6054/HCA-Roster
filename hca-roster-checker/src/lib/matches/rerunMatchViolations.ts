import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

export type MatchViolationRerunSummary = {
  matchesChecked: number;
  matchPlayersChecked: number;
  registeredPlayers: number;
  unregisteredPlayers: number;
  deletedViolations: number;
  violationsCreated: number;
};

function emptySummary(): MatchViolationRerunSummary {
  return {
    matchesChecked: 0,
    matchPlayersChecked: 0,
    registeredPlayers: 0,
    unregisteredPlayers: 0,
    deletedViolations: 0,
    violationsCreated: 0,
  };
}

export async function getActiveGamepassIdsByTeam(teamIds: string[], season: string) {
  const [latestUploadLogs, addedGamespassLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        entityType: "Team",
        entityId: { in: teamIds },
        action: "ROSTER_UPLOADED",
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        entityId: true,
        details: true,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: "Team",
        entityId: { in: teamIds },
        action: "ROSTER_GAMEPASS_PLAYER_ADDED",
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        entityId: true,
        details: true,
      },
    }),
  ]);

  const latestUploadByTeam = new Map<string, Record<string, unknown>>();
  for (const log of latestUploadLogs) {
    if (!log.entityId || latestUploadByTeam.has(log.entityId)) {
      continue;
    }

    const details =
      log.details && typeof log.details === "object" && !Array.isArray(log.details)
        ? (log.details as Record<string, unknown>)
        : null;

    if (details) {
      latestUploadByTeam.set(log.entityId, details);
    }
  }

  const gamepassIdsByTeam = new Map<string, Set<string>>();
  for (const teamId of teamIds) {
    gamepassIdsByTeam.set(teamId, new Set<string>());
  }

  for (const [teamId, details] of latestUploadByTeam.entries()) {
    const uploadSeason = typeof details.season === "string" ? details.season : null;
    if (uploadSeason !== season || !Array.isArray(details.gamespassMembers)) {
      continue;
    }

    for (const member of details.gamespassMembers) {
      if (!member || typeof member !== "object" || Array.isArray(member)) {
        continue;
      }

      const record = member as Record<string, unknown>;
      const gamepassId = typeof record.id === "string" ? record.id : null;
      if (gamepassId) {
        gamepassIdsByTeam.get(teamId)?.add(gamepassId.toLowerCase());
      }
    }
  }

  for (const log of addedGamespassLogs) {
    if (!log.entityId) {
      continue;
    }

    const details =
      log.details && typeof log.details === "object" && !Array.isArray(log.details)
        ? (log.details as Record<string, unknown>)
        : null;

    if (!details) {
      continue;
    }

    const detailSeason = typeof details.season === "string" ? details.season : season;
    const gamepassId = typeof details.gamepassId === "string" ? details.gamepassId : null;
    if (detailSeason === season && gamepassId) {
      gamepassIdsByTeam.get(log.entityId)?.add(gamepassId.toLowerCase());
    }
  }

  return gamepassIdsByTeam;
}

export async function rerunMatchRosterViolationsForMatch(
  matchId: string,
  season = "2026-S1",
): Promise<MatchViolationRerunSummary> {
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
      matchPlayers: true,
    },
  });

  if (!match) {
    throw new Error("Match not found.");
  }

  const summary = emptySummary();
  summary.matchesChecked = 1;
  summary.matchPlayersChecked = match.matchPlayers.length;

  const activeRosterByTeam = new Map<string, Set<string>>([
    [match.teamAId, new Set(match.teamA.rosterEntries.map((entry) => entry.player.steamId64))],
    [match.teamBId, new Set(match.teamB.rosterEntries.map((entry) => entry.player.steamId64))],
  ]);
  const activeGamepassIdsByTeam = await getActiveGamepassIdsByTeam([match.teamAId, match.teamBId], season);

  const deleted = await prisma.violation.deleteMany({
    where: {
      matchId,
      type: ViolationType.UNREGISTERED_PLAYER,
    },
  });
  summary.deletedViolations = deleted.count;

  for (const player of match.matchPlayers) {
    const steamId64 = player.steamId64?.trim() || null;
    if (steamId64 && activeRosterByTeam.get(player.teamId)?.has(steamId64)) {
      summary.registeredPlayers += 1;
      continue;
    }

    if (isLikelyGamespassId(player.rawSteamId) && activeGamepassIdsByTeam.get(player.teamId)?.has(player.rawSteamId.toLowerCase())) {
      summary.registeredPlayers += 1;
      continue;
    }

    await prisma.violation.create({
      data: {
        type: ViolationType.UNREGISTERED_PLAYER,
        severity: ViolationSeverity.HIGH,
        status: ViolationStatus.OPEN,
        teamId: player.teamId,
        playerId: player.playerId,
        matchId: player.matchId,
        rawSteamId: player.rawSteamId,
        details: {
          reason: "Player appeared in match stats but is not on active roster",
          displayName: player.displayName,
          source: "MATCH_RERUN",
        } as Prisma.JsonObject,
      },
    });

    summary.unregisteredPlayers += 1;
    summary.violationsCreated += 1;
  }

  return summary;
}

export async function rerunAllMatchRosterViolations(season = "2026-S1"): Promise<MatchViolationRerunSummary> {
  const matches = await prisma.match.findMany({
    where: {
      matchPlayers: {
        some: {},
      },
    },
    select: {
      id: true,
    },
    orderBy: [{ week: "asc" }, { createdAt: "asc" }],
  });

  const totals = emptySummary();

  for (const match of matches) {
    const summary = await rerunMatchRosterViolationsForMatch(match.id, season);
    totals.matchesChecked += summary.matchesChecked;
    totals.matchPlayersChecked += summary.matchPlayersChecked;
    totals.registeredPlayers += summary.registeredPlayers;
    totals.unregisteredPlayers += summary.unregisteredPlayers;
    totals.deletedViolations += summary.deletedViolations;
    totals.violationsCreated += summary.violationsCreated;
  }

  return totals;
}
