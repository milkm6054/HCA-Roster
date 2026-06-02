import {
  AccountAgeRisk,
  RosterEntryStatus,
  ViolationSeverity,
  ViolationStatus,
  ViolationType,
} from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const season = "2026-S1";

  await prisma.matchPlayer.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.rosterEntry.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.auditLog.deleteMany();

  const [teamA, teamB, teamC] = await Promise.all([
    prisma.team.create({ data: { name: "Able Company", tag: "ABLE" } }),
    prisma.team.create({ data: { name: "Baker Squad", tag: "BAKER" } }),
    prisma.team.create({ data: { name: "Charlie Unit", tag: "CHARLIE" } }),
  ]);

  const players = await Promise.all([
    prisma.player.create({
      data: {
        steamId64: "76561198000000001",
        displayName: "Player One",
        accountAgeRisk: AccountAgeRisk.LOW,
      },
    }),
    prisma.player.create({
      data: {
        steamId64: "76561198000000002",
        displayName: "Player Two",
        accountAgeRisk: AccountAgeRisk.MEDIUM,
      },
    }),
    prisma.player.create({
      data: {
        steamId64: "76561198000000003",
        displayName: "Player Three",
        accountAgeRisk: AccountAgeRisk.HIGH,
      },
    }),
  ]);

  await prisma.rosterEntry.createMany({
    data: [
      {
        teamId: teamA.id,
        playerId: players[0].id,
        season,
        status: RosterEntryStatus.ACTIVE,
      },
      {
        teamId: teamA.id,
        playerId: players[1].id,
        season,
        status: RosterEntryStatus.ACTIVE,
      },
      {
        teamId: teamB.id,
        playerId: players[0].id,
        season,
        status: RosterEntryStatus.ACTIVE,
      },
      {
        teamId: teamC.id,
        playerId: players[2].id,
        season,
        status: RosterEntryStatus.ACTIVE,
      },
    ],
  });

  const match = await prisma.match.create({
    data: {
      week: 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      playedAt: new Date(),
    },
  });

  await prisma.violation.createMany({
    data: [
      {
        type: ViolationType.DUPLICATE_ROSTER,
        severity: ViolationSeverity.CRITICAL,
        status: ViolationStatus.OPEN,
        teamId: teamB.id,
        playerId: players[0].id,
        rawSteamId: players[0].steamId64,
        details: { reason: "Sample duplicate roster issue" },
      },
      {
        type: ViolationType.UNREGISTERED_PLAYER,
        severity: ViolationSeverity.HIGH,
        status: ViolationStatus.OPEN,
        teamId: teamA.id,
        matchId: match.id,
        rawSteamId: "76561198009999999",
        details: { reason: "Sample unregistered match player" },
      },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
