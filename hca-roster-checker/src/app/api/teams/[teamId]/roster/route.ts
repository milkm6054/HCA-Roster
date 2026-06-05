import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
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

  const [roster, submittedEntriesCount, changeLogs, latestUploadLog] = await Promise.all([
    prisma.rosterEntry.findMany({
      where: {
        teamId,
        season,
        status: "ACTIVE",
      },
      include: { player: true },
      orderBy: [{ submittedAt: "desc" }],
    }),
    prisma.rosterEntry.count({
      where: {
        teamId,
        season,
      },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: "Team",
        entityId: teamId,
        action: {
          in: ["ROSTER_PLAYER_ADDED", "ROSTER_PLAYER_REMOVED"],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        action: true,
        actor: true,
        details: true,
        createdAt: true,
      },
    }),
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
  ]);

  const changes = changeLogs
    .map((log) => {
      const details =
        log.details && typeof log.details === "object" && !Array.isArray(log.details)
          ? (log.details as Record<string, unknown>)
          : null;
      const detailSeason = typeof details?.season === "string" ? details.season : null;

      if (detailSeason && detailSeason !== season) {
        return null;
      }

      return {
        id: log.id,
        action: log.action,
        actor: log.actor,
        steamId64: typeof details?.steamId64 === "string" ? details.steamId64 : null,
        displayName: typeof details?.displayName === "string" ? details.displayName : null,
        season: detailSeason || season,
        createdAt: log.createdAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const uploadDetails =
    latestUploadLog?.details &&
    typeof latestUploadLog.details === "object" &&
    !Array.isArray(latestUploadLog.details)
      ? (latestUploadLog.details as Record<string, unknown>)
      : null;
  const uploadSeason = typeof uploadDetails?.season === "string" ? uploadDetails.season : null;
  const gamespassMembers =
    uploadSeason === season && Array.isArray(uploadDetails?.gamespassMembers)
      ? uploadDetails.gamespassMembers
          .filter((item): item is { id: string; displayName?: string | null; rowNumber?: number | null } => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return false;
            const cast = item as Record<string, unknown>;
            return typeof cast.id === "string";
          })
          .map((item) => ({
            id: item.id,
            displayName: item.displayName ?? null,
            rowNumber: item.rowNumber ?? null,
          }))
      : [];

  return NextResponse.json({
    season,
    roster,
    hasSubmittedRoster: submittedEntriesCount > 0,
    changes,
    gamespassMembers,
  });
}
