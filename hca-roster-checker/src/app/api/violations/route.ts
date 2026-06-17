import { ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

function isSupportedViolationType(value: string): value is "DUPLICATE_ROSTER" | "INVALID_STEAM_ID" {
  return value === ViolationType.DUPLICATE_ROSTER || value === ViolationType.INVALID_STEAM_ID;
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  await Promise.all([
    prisma.violation.deleteMany({
      where: {
        type: ViolationType.UNREGISTERED_PLAYER,
        matchId: null,
      },
    }),
    prisma.violation.deleteMany({
      where: {
        type: {
          in: [ViolationType.DUPLICATE_ROSTER, ViolationType.INVALID_STEAM_ID],
        },
        teamId: null,
        matchId: null,
      },
    }),
    prisma.violation.deleteMany({
      where: {
        type: ViolationType.DUPLICATE_ROSTER,
        matchId: null,
        details: {
          path: ["issue", "type"],
          equals: "DUPLICATE_IN_UPLOAD",
        },
      },
    }),
  ]);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const violationType = type && isSupportedViolationType(type) ? type : undefined;

  const violationStatus =
    status && Object.values(ViolationStatus).includes(status as ViolationStatus)
      ? (status as ViolationStatus)
      : ViolationStatus.OPEN;

  const [violations, resolvedLogs] = await Promise.all([
    prisma.violation.findMany({
      where: {
        type: violationType ?? {
          in: [ViolationType.DUPLICATE_ROSTER, ViolationType.INVALID_STEAM_ID],
        },
        status: violationStatus,
        teamId: isOrga(auth.session)
          ? {
              not: null,
            }
          : (auth.session.teamId ?? "__no_team__"),
      },
      include: {
        team: true,
        player: {
          include: {
            rosterEntries: {
              where: {
                status: "ACTIVE",
              },
              include: {
                team: true,
              },
              orderBy: {
                submittedAt: "desc",
              },
            },
          },
        },
        match: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: {
        action: "VIOLATION_RESOLVED",
        ...(isOrga(auth.session)
          ? {}
          : {
              details: {
                path: ["teamId"],
                equals: auth.session.teamId ?? "__no_team__",
              },
            }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        actor: true,
        details: true,
        createdAt: true,
      },
    }),
  ]);

  const resolvedViolations = resolvedLogs.map((log) => {
    const details =
      log.details && typeof log.details === "object" && !Array.isArray(log.details)
        ? (log.details as Record<string, unknown>)
        : {};

    return {
      id: log.id,
      actor: log.actor,
      createdAt: log.createdAt,
      violationType: typeof details.violationType === "string" ? details.violationType : null,
      playerName: typeof details.playerName === "string" ? details.playerName : null,
      rawSteamId: typeof details.rawSteamId === "string" ? details.rawSteamId : null,
      teamName: typeof details.teamName === "string" ? details.teamName : null,
      resolution: typeof details.resolution === "string" ? details.resolution : null,
      keptTeamName: typeof details.keptTeamName === "string" ? details.keptTeamName : null,
      removedTeamNames: Array.isArray(details.removedTeamNames) ? details.removedTeamNames : [],
    };
  });

  return NextResponse.json({
    violations: violations.filter((violation) => !isLikelyGamespassId(violation.rawSteamId || "")),
    resolvedViolations,
  });
}
