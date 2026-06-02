import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

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
              conflictingTeamIds: teamIds.filter((id) => id !== entry.teamId),
            } as Prisma.JsonObject,
          },
        });
        violationsCreated += 1;
      }
    }

    for (const entry of relatedEntries) {
      const age = estimateSteamAccountCreatedAt(entry.player.steamId64);
      if (age.accountAgeRisk === "LOW" || age.accountAgeRisk === "UNKNOWN") {
        continue;
      }

      await prisma.violation.create({
        data: {
          type: ViolationType.NEW_ACCOUNT,
          severity: age.accountAgeRisk as ViolationSeverity,
          status: ViolationStatus.OPEN,
          teamId: entry.teamId,
          playerId: entry.playerId,
          rawSteamId: steamId64,
          details: {
            season,
            accountAgeRisk: age.accountAgeRisk,
            estimatedCreatedAt: age.estimatedCreatedAt?.toISOString(),
          } as Prisma.JsonObject,
        },
      });
      violationsCreated += 1;
    }
  }

  return NextResponse.json({
    season,
    activeRosterEntries: entries.length,
    violationsCreated,
  });
}
