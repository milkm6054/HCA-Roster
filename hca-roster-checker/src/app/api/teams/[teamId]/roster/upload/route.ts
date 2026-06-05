import { Prisma, ViolationSeverity, ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/auditLog";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { queueNotification } from "@/lib/notifications/notifications";
import { prisma } from "@/lib/prisma";
import { parseRosterCsv } from "@/lib/rosters/parseRosterCsv";
import { validateRoster } from "@/lib/rosters/validateRoster";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { readCsvFromRequest } from "@/lib/http/readCsvFromRequest";

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

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2026-S1";

  if (auth.session.role === "TEAM_REP") {
    const existingSubmissionCount = await prisma.rosterEntry.count({
      where: {
        teamId,
        season,
      },
    });

    if (existingSubmissionCount > 0) {
      return NextResponse.json(
        { error: "Initial roster has already been submitted for this season." },
        { status: 409 },
      );
    }
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const { csvText, sourceFileName } = await readCsvFromRequest(request);
  if (!csvText.trim()) {
    return NextResponse.json({ error: "No CSV data found." }, { status: 400 });
  }

  const parsed = parseRosterCsv(csvText);
  const validation = await validateRoster({ teamId, season, rows: parsed.rows });
  const gamespassMembers = validation.issues
    .filter((issue) => issue.type === "GAMESPASS_ID")
    .map((issue) => ({
      id: issue.steamIdInput,
      displayName:
        parsed.rows.find((row) => row.rowNumber === issue.rowNumbers?.[0])?.displayName || null,
      rowNumber: issue.rowNumbers?.[0] ?? null,
    }));

  const uniqueRows = new Map<string, (typeof validation.normalizedRows)[number]>();
  for (const row of validation.normalizedRows) {
    if (!uniqueRows.has(row.steamId64)) {
      uniqueRows.set(row.steamId64, row);
    }
  }

  const actor = await getActor(request);
  let acceptedPlayers = 0;

  await prisma.$transaction(async (tx) => {
    for (const normalized of uniqueRows.values()) {
      const age = estimateSteamAccountCreatedAt(normalized.steamId64);
      const player = await tx.player.upsert({
        where: { steamId64: normalized.steamId64 },
        create: {
          steamId64: normalized.steamId64,
          steamId3: normalized.steamId3,
          displayName: normalized.row.displayName,
          estimatedCreatedAt: age.estimatedCreatedAt,
          accountAgeRisk: age.accountAgeRisk,
        },
        update: {
          steamId3: normalized.steamId3,
          displayName: normalized.row.displayName || undefined,
          estimatedCreatedAt: age.estimatedCreatedAt,
          accountAgeRisk: age.accountAgeRisk,
        },
      });

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
          status: "ACTIVE",
          submittedBy: actor,
          submittedAt: new Date(),
        },
        update: {
          status: "ACTIVE",
          submittedBy: actor,
          submittedAt: new Date(),
        },
      });

      acceptedPlayers += 1;
    }

    for (const issue of validation.issues) {
      const shouldPersist =
        issue.type === "INVALID_STEAM_ID" ||
        issue.type === "DUPLICATE_IN_UPLOAD" ||
        issue.type === "DUPLICATE_ACROSS_TEAMS";

      if (!shouldPersist) {
        continue;
      }

      await tx.violation.create({
        data: {
          type:
            issue.type === "INVALID_STEAM_ID"
              ? ViolationType.INVALID_STEAM_ID
              : ViolationType.DUPLICATE_ROSTER,
          severity: issue.severity as ViolationSeverity,
          status: ViolationStatus.OPEN,
          teamId,
          rawSteamId: issue.steamIdInput,
          details: {
            issue,
            season,
            sourceFileName,
          } as Prisma.JsonObject,
        },
      });
    }
  });

  await createAuditLog({
    action: "ROSTER_UPLOADED",
    actor,
    entityType: "Team",
    entityId: teamId,
    details: {
      season,
      acceptedPlayers,
      invalidRows: validation.invalidRows,
      malformedRows: parsed.malformedRows.length,
      gamespassMembers,
    },
  });

  await queueNotification({
    type: "ROSTER_VALIDATION_SUMMARY",
    payload: {
      teamId,
      season,
      acceptedPlayers,
      issueCount: validation.issues.filter((issue) => issue.type !== "GAMESPASS_ID").length,
    },
  });

  return NextResponse.json({
    season,
    acceptedPlayers,
    malformedRows: parsed.malformedRows,
    validation: {
      validRows: validation.validRows,
      invalidRows: validation.invalidRows,
      issues: validation.issues,
    },
    gamespassMembers,
  });
}
