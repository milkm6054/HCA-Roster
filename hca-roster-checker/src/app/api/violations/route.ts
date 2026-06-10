import { ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  await prisma.violation.deleteMany({
    where: {
      type: ViolationType.UNREGISTERED_PLAYER,
      matchId: null,
    },
  });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const violationType =
    type && Object.values(ViolationType).includes(type as ViolationType)
      ? (type as ViolationType)
      : undefined;

  const violationStatus =
    status && Object.values(ViolationStatus).includes(status as ViolationStatus)
      ? (status as ViolationStatus)
      : undefined;

  const violations = await prisma.violation.findMany({
    where: {
      NOT: {
        type: ViolationType.NEW_ACCOUNT,
      },
      type: violationType,
      status: violationStatus,
      teamId: isOrga(auth.session) ? undefined : (auth.session.teamId ?? "__no_team__"),
    },
    include: {
      team: true,
      player: true,
      match: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    violations: violations.filter((violation) => !isLikelyGamespassId(violation.rawSteamId || "")),
  });
}
