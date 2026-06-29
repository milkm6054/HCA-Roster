import { NextResponse } from "next/server";
import { Prisma, RosterEntryStatus, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { rerunMatchRosterViolationsForMatch } from "@/lib/matches/rerunMatchViolations";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { normalizeSteamId } from "@/lib/steam/steamIds";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ violationId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { violationId } = await params;
  const body = (await request.json()) as {
    selectedTeamId?: string;
    resolutionType?: "STEAM_ID" | "GAMESPASS" | "REMOVE_INVALID_ENTRY" | "ADD_TO_TEAM_ROSTER";
    correctedSteamId?: string;
    season?: string;
    displayName?: string;
  };

  const existingViolation = await prisma.violation.findUnique({
    where: { id: violationId },
    include: {
      team: true,
      player: {
        include: {
          rosterEntries: {
            where: {
              status: RosterEntryStatus.ACTIVE,
            },
            include: {
              team: true,
            },
          },
        },
      },
    },
  });

  if (!existingViolation) {
    return NextResponse.json({ error: "Violation not found." }, { status: 404 });
  }

  if (
    existingViolation.type !== ViolationType.DUPLICATE_ROSTER &&
    existingViolation.type !== ViolationType.INVALID_STEAM_ID &&
    existingViolation.type !== ViolationType.UNREGISTERED_PLAYER
  ) {
    return NextResponse.json({ error: "This violation type cannot be resolved here." }, { status: 400 });
  }

  if (existingViolation.status !== ViolationStatus.OPEN) {
    return NextResponse.json({ error: "Only open violations can be resolved." }, { status: 409 });
  }

  const actor = await getActor(request);
  let keptTeamName: string | null = null;
  let removedTeamNames: string[] = [];
  let resolution = "Resolved violation";
  let duplicateViolationsCreated = 0;
  let rerunSummary: Awaited<ReturnType<typeof rerunMatchRosterViolationsForMatch>> | null = null;

  if (existingViolation.type === ViolationType.DUPLICATE_ROSTER) {
    const selectedTeamId = body.selectedTeamId?.trim();
    if (!selectedTeamId) {
      return NextResponse.json({ error: "selectedTeamId is required for duplicate roster violations." }, { status: 400 });
    }

    if (!existingViolation.playerId || !existingViolation.player) {
      return NextResponse.json({ error: "Duplicate roster violation is missing its player." }, { status: 400 });
    }

    const activeEntries = existingViolation.player.rosterEntries;
    const selectedEntry = activeEntries.find((entry) => entry.teamId === selectedTeamId);
    if (!selectedEntry) {
      return NextResponse.json({ error: "Selected team is not an active roster option for this player." }, { status: 400 });
    }

    const removedEntries = activeEntries.filter((entry) => entry.teamId !== selectedTeamId);
    keptTeamName = selectedEntry.team.name;
    removedTeamNames = removedEntries.map((entry) => entry.team.name);

    await prisma.$transaction(async (tx) => {
      if (removedEntries.length > 0) {
        await tx.rosterEntry.updateMany({
          where: {
            id: {
              in: removedEntries.map((entry) => entry.id),
            },
          },
          data: {
            status: RosterEntryStatus.REMOVED,
            submittedBy: actor,
            submittedAt: new Date(),
          },
        });
      }

      await tx.violation.updateMany({
        where: {
          type: ViolationType.DUPLICATE_ROSTER,
          status: ViolationStatus.OPEN,
          playerId: existingViolation.playerId,
        },
        data: { status: ViolationStatus.CONFIRMED },
      });
    });
    resolution = "Selected active roster team and removed other roster entries";
  } else if (existingViolation.type === ViolationType.INVALID_STEAM_ID) {
    const resolutionType = body.resolutionType;
    if (resolutionType === "GAMESPASS") {
      await prisma.violation.update({
        where: { id: violationId },
        data: { status: ViolationStatus.CONFIRMED },
      });
      resolution = "Confirmed player is a Game Pass player";
    } else if (resolutionType === "REMOVE_INVALID_ENTRY") {
      await prisma.violation.update({
        where: { id: violationId },
        data: { status: ViolationStatus.CONFIRMED },
      });
      resolution = "Removed invalid roster entry";
    } else if (resolutionType === "STEAM_ID") {
      const correctedSteamIdInput = body.correctedSteamId?.trim() || "";
      if (!correctedSteamIdInput) {
        return NextResponse.json({ error: "A replacement Steam ID is required." }, { status: 400 });
      }

      const normalized = normalizeSteamId(correctedSteamIdInput);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.reason }, { status: 400 });
      }

      if (!existingViolation.teamId) {
        return NextResponse.json({ error: "Invalid Steam ID violation is missing its team." }, { status: 400 });
      }
      const teamId = existingViolation.teamId;

      const details =
        existingViolation.details && typeof existingViolation.details === "object" && !Array.isArray(existingViolation.details)
          ? (existingViolation.details as Record<string, unknown>)
          : {};
      const season = typeof details.season === "string" ? details.season : "2026-S1";
      const displayName =
        typeof details.displayName === "string"
          ? details.displayName
          : existingViolation.player?.displayName || null;

      const age = estimateSteamAccountCreatedAt(normalized.steamId64);

      try {
        await prisma.$transaction(async (tx) => {
          const existingPlayer = await tx.player.findUnique({
            where: { steamId64: normalized.steamId64 },
            include: {
              rosterEntries: {
                where: {
                  season,
                  status: RosterEntryStatus.ACTIVE,
                },
                include: {
                  team: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });

          const activeEntries = existingPlayer?.rosterEntries || [];
          const existingEntryOnThisTeam = activeEntries.find((entry) => entry.teamId === teamId);

          const player = await tx.player.upsert({
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

          if (!existingEntryOnThisTeam) {
            await tx.rosterEntry.upsert({
              where: {
                teamId_playerId_season: {
                  teamId,
                  playerId: player.id,
                  season,
                },
              },
              create: {
                teamId,
                playerId: player.id,
                season,
                status: RosterEntryStatus.ACTIVE,
                submittedBy: actor,
                submittedAt: new Date(),
                lockedAt: null,
              },
              update: {
                status: RosterEntryStatus.ACTIVE,
                submittedBy: actor,
                submittedAt: new Date(),
                lockedAt: null,
              },
            });
          }

          const refreshedEntries = await tx.rosterEntry.findMany({
            where: {
              season,
              status: RosterEntryStatus.ACTIVE,
              playerId: player.id,
            },
            include: {
              team: true,
              player: true,
            },
          });

          const uniqueTeamIds = [...new Set(refreshedEntries.map((entry) => entry.teamId))];
          if (uniqueTeamIds.length > 1) {
            await tx.violation.deleteMany({
              where: {
                type: ViolationType.DUPLICATE_ROSTER,
                status: ViolationStatus.OPEN,
                playerId: player.id,
                matchId: null,
              },
            });

            for (const entry of refreshedEntries) {
              await tx.violation.create({
                data: {
                  type: ViolationType.DUPLICATE_ROSTER,
                  severity: ViolationSeverity.CRITICAL,
                  status: ViolationStatus.OPEN,
                  teamId: entry.teamId,
                  playerId: player.id,
                  rawSteamId: player.steamId64,
                  details: {
                    season,
                    displayName: player.displayName,
                    teamName: entry.team.name,
                    conflictingTeamNames: refreshedEntries
                      .filter((relatedEntry) => relatedEntry.teamId !== entry.teamId)
                      .map((relatedEntry) => relatedEntry.team.name),
                    conflictingTeamIds: uniqueTeamIds.filter((id) => id !== entry.teamId),
                    source: "INVALID_STEAM_ID_RESOLUTION",
                  } as Prisma.JsonObject,
                },
              });
              duplicateViolationsCreated += 1;
            }
          }

          await tx.violation.update({
            where: { id: violationId },
            data: {
              status: ViolationStatus.CONFIRMED,
              playerId: player.id,
            },
          });
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }

      resolution =
        duplicateViolationsCreated > 0
          ? `Replaced invalid Steam ID with ${normalized.steamId64} and created duplicate roster violations`
          : `Replaced invalid Steam ID with ${normalized.steamId64}`;
    } else {
      return NextResponse.json(
        { error: "Choose whether this is a corrected Steam ID or a Game Pass ID." },
        { status: 400 },
      );
    }
  } else {
    if (body.resolutionType !== "ADD_TO_TEAM_ROSTER") {
      return NextResponse.json({ error: "Choose the add-to-roster action for this violation." }, { status: 400 });
    }

    if (!existingViolation.teamId || !existingViolation.matchId) {
      return NextResponse.json({ error: "This match violation is missing its team or match reference." }, { status: 400 });
    }

    const teamId = existingViolation.teamId;
    const matchId = existingViolation.matchId;
    const normalized = normalizeSteamId(existingViolation.rawSteamId || "");
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.reason }, { status: 400 });
    }

    const season = body.season?.trim() || "2026-S1";
    const details =
      existingViolation.details && typeof existingViolation.details === "object" && !Array.isArray(existingViolation.details)
        ? (existingViolation.details as Record<string, unknown>)
        : {};
    const displayName =
      body.displayName?.trim() ||
      existingViolation.player?.displayName ||
      (typeof details.displayName === "string" ? details.displayName : null);
    const age = estimateSteamAccountCreatedAt(normalized.steamId64);

    try {
      await prisma.$transaction(async (tx) => {
        const existingPlayer = await tx.player.findUnique({
          where: { steamId64: normalized.steamId64 },
          include: {
            rosterEntries: {
              where: {
                season,
                status: RosterEntryStatus.ACTIVE,
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
        const memberName = displayName || existingPlayer?.displayName || existingViolation.rawSteamId || normalized.steamId64;

        if (conflictingEntries.length > 0) {
          const conflictingTeamNames = conflictingEntries.map((entry) => entry.team.name).join(", ");
          throw new Error(`${memberName} is already part of ${conflictingTeamNames}.`);
        }

        const player = await tx.player.upsert({
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

        if (!existingEntryOnThisTeam) {
          await tx.rosterEntry.upsert({
            where: {
                teamId_playerId_season: {
                teamId,
                playerId: player.id,
                season,
              },
            },
            create: {
              teamId,
              playerId: player.id,
              season,
              status: RosterEntryStatus.ACTIVE,
              submittedBy: actor,
              submittedAt: new Date(),
              lockedAt: null,
            },
            update: {
              status: RosterEntryStatus.ACTIVE,
              submittedBy: actor,
              submittedAt: new Date(),
              lockedAt: null,
            },
          });
        }

        await tx.matchPlayer.updateMany({
          where: {
            matchId,
            teamId,
            rawSteamId: existingViolation.rawSteamId || "",
          },
          data: {
            playerId: player.id,
            steamId64: player.steamId64,
            displayName: displayName || undefined,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      throw error;
    }

    rerunSummary = await rerunMatchRosterViolationsForMatch(matchId);
    resolution = `Added player to active roster for ${season} and reran match validation`;
  }

  await createAuditLog({
    action: "VIOLATION_RESOLVED",
    actor,
    entityType: "Violation",
    entityId: existingViolation.id,
    details: {
      violationType: existingViolation.type,
      resolution,
      teamId: existingViolation.teamId,
      teamName: existingViolation.team?.name || null,
      playerId: existingViolation.playerId,
      playerName: existingViolation.player?.displayName || null,
      rawSteamId: existingViolation.rawSteamId,
      correctedSteamId: body.correctedSteamId?.trim() || null,
      keptTeamName,
      removedTeamNames,
    },
  });

  return NextResponse.json({
    violation: {
      ...existingViolation,
      status: existingViolation.type === ViolationType.UNREGISTERED_PLAYER ? ViolationStatus.DISMISSED : ViolationStatus.CONFIRMED,
    },
    duplicateViolationsCreated,
    rerunSummary,
  });
}
