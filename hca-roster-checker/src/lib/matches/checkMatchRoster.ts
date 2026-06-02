import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedMatchStatsRow } from "@/lib/matches/parseMatchStatsCsv";
import { normalizeSteamId } from "@/lib/steam/steamIds";

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

  const allSteamIds = rows
    .map((row) => normalizeSteamId(row.steamId))
    .filter((res): res is Extract<typeof res, { ok: true }> => res.ok)
    .map((res) => res.steamId64);

  const knownPlayers = await prisma.player.findMany({
    where: { steamId64: { in: [...new Set(allSteamIds)] } },
    select: { id: true, steamId64: true },
  });

  const playerIdBySteamId64 = new Map(knownPlayers.map((p) => [p.steamId64, p.id]));

  let registeredPlayers = 0;
  let unregisteredPlayers = 0;
  let violationsCreated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.matchPlayer.deleteMany({ where: { matchId } });

    for (const row of rows) {
      const teamId = teamMap.get(normalizeTeamLabel(row.team));
      const normalized = normalizeSteamId(row.steamId);
      const steamId64 = normalized.ok ? normalized.steamId64 : null;

      if (!teamId) {
        await tx.violation.create({
          data: {
            type: ViolationType.UNREGISTERED_PLAYER,
            severity: ViolationSeverity.CRITICAL,
            status: ViolationStatus.OPEN,
            matchId,
            rawSteamId: row.steamId,
            details: {
              reason: "Unknown team label in match stats upload",
              teamLabel: row.team,
              rowNumber: row.rowNumber,
            } as Prisma.JsonObject,
          },
        });
        unregisteredPlayers += 1;
        violationsCreated += 1;
        continue;
      }

      await tx.matchPlayer.create({
        data: {
          matchId,
          teamId,
          playerId: steamId64 ? playerIdBySteamId64.get(steamId64) : undefined,
          rawSteamId: row.steamId,
          steamId64: steamId64 || undefined,
          kills: row.kills,
          deaths: row.deaths,
          role: row.role,
          sourceFileName,
        },
      });

      const teamRoster = activeRosterByTeam.get(teamId) || new Set<string>();
      const isRegistered = steamId64 ? teamRoster.has(steamId64) : false;

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
