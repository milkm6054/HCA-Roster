import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { createAuditLog } from "@/lib/audit/auditLog";
import { prisma } from "@/lib/prisma";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { isLikelyGamespassId, normalizeSteamId } from "@/lib/steam/steamIds";

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
    gamepassId?: string;
    displayName?: string;
    season?: string;
  };

  const steamIdInput = body.steamId?.trim() || "";
  const gamepassIdInput = body.gamepassId?.trim() || "";
  const season = body.season?.trim() || "2026-S1";
  const displayName = body.displayName?.trim() || null;

  if (!steamIdInput && !gamepassIdInput) {
    return NextResponse.json({ error: "steamId or gamepassId is required." }, { status: 400 });
  }

  if (steamIdInput && gamepassIdInput) {
    return NextResponse.json({ error: "Submit either a Steam ID or a Game Pass ID, not both." }, { status: 400 });
  }

  const actor = await getActor(request);

  if (gamepassIdInput) {
    if (!isLikelyGamespassId(gamepassIdInput)) {
      return NextResponse.json({ error: "Game Pass ID must be a 32-character hex ID." }, { status: 400 });
    }

    const [latestUploadLog, addedGamepassLogs] = await Promise.all([
      prisma.auditLog.findFirst({
        where: {
          entityType: "Team",
          entityId: teamId,
          action: "ROSTER_UPLOADED",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          details: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: "Team",
          entityId: teamId,
          action: "ROSTER_GAMEPASS_PLAYER_ADDED",
        },
        select: {
          details: true,
        },
      }),
    ]);

    const uploadedDetails =
      latestUploadLog?.details &&
      typeof latestUploadLog.details === "object" &&
      !Array.isArray(latestUploadLog.details)
        ? (latestUploadLog.details as Record<string, unknown>)
        : null;
    const uploadedGamespassMembers =
      typeof uploadedDetails?.season === "string" &&
      uploadedDetails.season === season &&
      Array.isArray(uploadedDetails.gamespassMembers)
        ? uploadedDetails.gamespassMembers
        : [];
    const manuallyAddedGamepassIds = addedGamepassLogs
      .map((log) =>
        log.details && typeof log.details === "object" && !Array.isArray(log.details)
          ? (log.details as Record<string, unknown>)
          : null,
      )
      .filter((details) => typeof details?.season !== "string" || details.season === season)
      .map((details) => (typeof details?.gamepassId === "string" ? details.gamepassId : null))
      .filter((id): id is string => Boolean(id));
    const uploadedGamepassIds = uploadedGamespassMembers
      .map((member) =>
        member && typeof member === "object" && !Array.isArray(member)
          ? (member as Record<string, unknown>)
          : null,
      )
      .map((member) => (typeof member?.id === "string" ? member.id : null))
      .filter((id): id is string => Boolean(id));
    const existingGamepassIds = [...uploadedGamepassIds, ...manuallyAddedGamepassIds];

    if (existingGamepassIds.some((id) => id.toLowerCase() === gamepassIdInput.toLowerCase())) {
      return NextResponse.json({ error: "Game Pass player is already listed for this team." }, { status: 409 });
    }

    await createAuditLog({
      action: "ROSTER_GAMEPASS_PLAYER_ADDED",
      actor,
      entityType: "Team",
      entityId: teamId,
      details: {
        season,
        gamepassId: gamepassIdInput,
        displayName,
      },
    });

    return NextResponse.json(
      {
        gamespassMember: {
          id: gamepassIdInput,
          displayName,
          rowNumber: null,
        },
      },
      { status: 201 },
    );
  }

  const normalized = normalizeSteamId(steamIdInput);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.reason }, { status: 400 });
  }

  const age = estimateSteamAccountCreatedAt(normalized.steamId64);

  let player;
  let rosterEntry;

  try {
    ({ player, rosterEntry } = await prisma.$transaction(async (tx) => {
      const existingPlayer = await tx.player.findUnique({
        where: { steamId64: normalized.steamId64 },
        include: {
          rosterEntries: {
            where: {
              season,
              status: "ACTIVE",
            },
            include: {
              team: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      const activeEntries = existingPlayer?.rosterEntries || [];
      const existingEntryOnThisTeam = activeEntries.find((entry) => entry.teamId === teamId);
      const conflictingEntries = activeEntries.filter((entry) => entry.teamId !== teamId);
      const memberName = displayName || existingPlayer?.displayName || steamIdInput;

      if (existingEntryOnThisTeam) {
        throw new Error(`${memberName} is already part of this team.`);
      }

      if (conflictingEntries.length > 0) {
        const conflictingTeamNames = conflictingEntries.map((entry) => entry.team.name).join(", ");
        throw new Error(`${memberName} is already part of ${conflictingTeamNames}.`);
      }

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
    }));
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    throw error;
  }

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
