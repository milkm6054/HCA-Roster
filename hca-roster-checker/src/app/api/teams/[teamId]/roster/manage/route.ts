import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { createAuditLog } from "@/lib/audit/auditLog";
import { prisma } from "@/lib/prisma";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { normalizeSteamId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  if (!canAccessTeam(auth.session, teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    steamId?: string;
    displayName?: string;
    season?: string;
  };

  const steamIdInput = body.steamId?.trim() || "";
  const season = body.season?.trim() || "2026-S1";
  const displayName = body.displayName?.trim() || null;

  if (!steamIdInput) {
    return NextResponse.json({ error: "steamId is required." }, { status: 400 });
  }

  const normalized = normalizeSteamId(steamIdInput);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }

  const actor = await getActor(request);
  const age = estimateSteamAccountCreatedAt(normalized.steamId64);

  const { player, rosterEntry } = await prisma.$transaction(async (tx) => {
    const upsertedPlayer = await tx.player.upsert({
      where: { steamId64: normalized.steamId64 },
      create: {
        steamId64: normalized.steamId64,
        steamId3: normalized.steamId3,
        displayName,
        estimatedCreatedAt: age.estimatedCreatedAt,
        accountAgeRisk: age.accountAgeRisk,
      },
      update: {
        steamId3: normalized.steamId3,
        displayName: displayName || undefined,
        estimatedCreatedAt: age.estimatedCreatedAt,
        accountAgeRisk: age.accountAgeRisk,
      },
    });

    const upsertedEntry = await tx.rosterEntry.upsert({
      where: {
        teamId_playerId_season: {
          teamId,
          playerId: upsertedPlayer.id,
          season,
        },
      },
      create: {
        teamId,
        playerId: upsertedPlayer.id,
        season,
        status: "ACTIVE",
        submittedBy: actor,
        submittedAt: new Date(),
        lockedAt: null,
      },
      update: {
        status: "ACTIVE",
        submittedBy: actor,
        submittedAt: new Date(),
        lockedAt: null,
      },
      include: { player: true },
    });

    return { player: upsertedPlayer, rosterEntry: upsertedEntry };
  });

  await createAuditLog({
    action: "ROSTER_PLAYER_ADDED",
    actor,
    entityType: "Team",
    entityId: teamId,
    details: {
      season,
      steamId64: player.steamId64,
      displayName: player.displayName,
    },
  });

  return NextResponse.json({ rosterEntry }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const { teamId } = await params;
  if (!canAccessTeam(auth.session, teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    rosterEntryId?: string;
  };

  const rosterEntryId = body.rosterEntryId?.trim();
  if (!rosterEntryId) {
    return NextResponse.json({ error: "rosterEntryId is required." }, { status: 400 });
  }

  const existingEntry = await prisma.rosterEntry.findFirst({
    where: {
      id: rosterEntryId,
      teamId,
    },
    include: {
      player: true,
    },
  });

  if (!existingEntry) {
    return NextResponse.json({ error: "Roster entry not found." }, { status: 404 });
  }

  if (existingEntry.status === "REMOVED") {
    return NextResponse.json({ ok: true, alreadyRemoved: true });
  }

  const actor = await getActor(request);

  await prisma.rosterEntry.update({
    where: { id: existingEntry.id },
    data: {
      status: "REMOVED",
      submittedBy: actor,
      submittedAt: new Date(),
    },
  });

  await createAuditLog({
    action: "ROSTER_PLAYER_REMOVED",
    actor,
    entityType: "Team",
    entityId: teamId,
    details: {
      season: existingEntry.season,
      steamId64: existingEntry.player.steamId64,
      displayName: existingEntry.player.displayName,
    },
  });

  return NextResponse.json({ ok: true });
}
