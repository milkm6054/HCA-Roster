import { NextResponse } from "next/server";
import { RosterEntryStatus, ViolationStatus, ViolationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";

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
    existingViolation.type !== ViolationType.INVALID_STEAM_ID
  ) {
    return NextResponse.json({ error: "This violation type cannot be resolved here." }, { status: 400 });
  }

  if (existingViolation.status !== ViolationStatus.OPEN) {
    return NextResponse.json({ error: "Only open violations can be resolved." }, { status: 409 });
  }

  const actor = await getActor(request);
  let keptTeamName: string | null = null;
  let removedTeamNames: string[] = [];

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
  } else {
    await prisma.violation.update({
      where: { id: violationId },
      data: { status: ViolationStatus.CONFIRMED },
    });
  }

  await createAuditLog({
    action: "VIOLATION_RESOLVED",
    actor,
    entityType: "Violation",
    entityId: existingViolation.id,
    details: {
      violationType: existingViolation.type,
      resolution:
        existingViolation.type === ViolationType.INVALID_STEAM_ID
          ? "Confirmed player is a Game Pass player"
          : "Selected active roster team and removed other roster entries",
      teamId: existingViolation.teamId,
      teamName: existingViolation.team?.name || null,
      playerId: existingViolation.playerId,
      playerName: existingViolation.player?.displayName || null,
      rawSteamId: existingViolation.rawSteamId,
      keptTeamName,
      removedTeamNames,
    },
  });

  return NextResponse.json({
    violation: {
      ...existingViolation,
      status: ViolationStatus.CONFIRMED,
    },
  });
}
