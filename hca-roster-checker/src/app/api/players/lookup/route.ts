import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { normalizeSteamId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const steamIdInput = searchParams.get("steamId")?.trim() || "";

  if (!steamIdInput) {
    return NextResponse.json({ error: "steamId is required." }, { status: 400 });
  }

  const normalized = normalizeSteamId(steamIdInput);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where: { steamId64: normalized.steamId64 },
    include: {
      matchPlayers: {
        include: {
          match: {
            include: {
              teamA: true,
              teamB: true,
            },
          },
          team: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!player) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  const entries = player.matchPlayers.filter((entry) => entry.match);
  const totals = entries.reduce(
    (accumulator, entry) => ({
      kills: accumulator.kills + (entry.kills || 0),
      deaths: accumulator.deaths + (entry.deaths || 0),
      kpm: accumulator.kpm + (entry.killsPerMinute || 0),
      dpm: accumulator.dpm + (entry.deathsPerMinute || 0),
      kpd: accumulator.kpd + (entry.killDeathRatio || 0),
    }),
    { kills: 0, deaths: 0, kpm: 0, dpm: 0, kpd: 0 },
  );

  const averageStats = entries.length
    ? {
        matches: entries.length,
        kills: totals.kills / entries.length,
        deaths: totals.deaths / entries.length,
        kpm: totals.kpm / entries.length,
        dpm: totals.dpm / entries.length,
        kpd: totals.kpd / entries.length,
      }
    : {
        matches: 0,
        kills: 0,
        deaths: 0,
        kpm: 0,
        dpm: 0,
        kpd: 0,
      };

  return NextResponse.json({
    player: {
      steamId64: player.steamId64,
      displayName: player.displayName,
      matchStats: entries.map((entry) => ({
        id: entry.id,
        matchId: entry.matchId,
        teamName: entry.team.name,
        week: entry.match?.week ?? null,
        axis: entry.match?.teamA.name ?? null,
        allies: entry.match?.teamB.name ?? null,
        mapName: entry.match?.mapName ?? null,
        midpointName: entry.match?.midpointName ?? null,
        gameUrl: entry.match?.gameUrl ?? null,
        kills: entry.kills,
        deaths: entry.deaths,
        kpd: entry.killDeathRatio,
        kpm: entry.killsPerMinute,
        dpm: entry.deathsPerMinute,
      })),
      averageStats,
    },
  });
}
