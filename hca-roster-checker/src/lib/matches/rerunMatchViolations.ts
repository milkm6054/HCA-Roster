import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

export async function rerunMatchRosterViolationsForMatch(matchId: string): Promise<MatchViolationRerunSummary> {
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

export async function rerunAllMatchRosterViolations(): Promise<MatchViolationRerunSummary> {
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
    const summary = await rerunMatchRosterViolationsForMatch(match.id);
    totals.matchesChecked += summary.matchesChecked;
    totals.matchPlayersChecked += summary.matchPlayersChecked;
    totals.registeredPlayers += summary.registeredPlayers;
    totals.unregisteredPlayers += summary.unregisteredPlayers;
    totals.deletedViolations += summary.deletedViolations;
    totals.violationsCreated += summary.violationsCreated;
  }

  return totals;
}
