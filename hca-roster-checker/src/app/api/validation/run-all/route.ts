import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { rerunAllMatchRosterViolations } from "@/lib/matches/rerunMatchViolations";
import { prisma } from "@/lib/prisma";
import { getRootAdminUsername } from "@/lib/auth/rootAdmin";

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const isRootByUsername = auth.session.username.toLowerCase() === getRootAdminUsername().toLowerCase();
  if (!isOrga(auth.session) && !isRootByUsername) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  const deleted = await prisma.violation.deleteMany({
    where: {
      type: {
        in: [ViolationType.DUPLICATE_ROSTER, ViolationType.NEW_ACCOUNT],
      },
      matchId: null,
    },
  });

  const entries = await prisma.rosterEntry.findMany({
    where: { season, status: "ACTIVE" },
    include: {
      team: true,
      player: true,
    },
  });

  const bySteamId = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = bySteamId.get(entry.player.steamId64) || [];
    list.push(entry);
    bySteamId.set(entry.player.steamId64, list);
  }

  let violationsCreated = 0;

  for (const [steamId64, relatedEntries] of bySteamId.entries()) {
    const teamIds = [...new Set(relatedEntries.map((entry) => entry.teamId))];

    if (teamIds.length > 1) {
      for (const entry of relatedEntries) {
        await prisma.violation.create({
          data: {
            type: ViolationType.DUPLICATE_ROSTER,
            severity: ViolationSeverity.CRITICAL,
            status: ViolationStatus.OPEN,
            teamId: entry.teamId,
            playerId: entry.playerId,
            rawSteamId: steamId64,
            details: {
              season,
              displayName: entry.player.displayName,
              teamName: entry.team.name,
              conflictingTeamNames: relatedEntries
                .filter((relatedEntry) => relatedEntry.teamId !== entry.teamId)
                .map((relatedEntry) => relatedEntry.team.name),
              conflictingTeamIds: teamIds.filter((id) => id !== entry.teamId),
            } as Prisma.JsonObject,
          },
        });
        violationsCreated += 1;
      }
    }

    // NEW_ACCOUNT checks are intentionally disabled.
  }

  const matchRerunSummary = await rerunAllMatchRosterViolations();

  return NextResponse.json({
    season,
    activeRosterEntries: entries.length,
    deletedViolations: deleted.count + matchRerunSummary.deletedViolations,
    violationsCreated: violationsCreated + matchRerunSummary.violationsCreated,
    duplicateRosterViolationsCreated: violationsCreated,
    matchViolationsCreated: matchRerunSummary.violationsCreated,
    matchViolationsDeleted: matchRerunSummary.deletedViolations,
    matchesChecked: matchRerunSummary.matchesChecked,
    matchPlayersChecked: matchRerunSummary.matchPlayersChecked,
  });
}
