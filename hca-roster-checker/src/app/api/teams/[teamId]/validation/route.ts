import { NextResponse } from "next/server";
import { canAccessTeam, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const auth = await requireApiSession(_request);
  if (!auth.ok) return auth.response;

  const { teamId } = await params;

  if (!canAccessTeam(auth.session, teamId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const violations = await prisma.violation.findMany({
    where: {
      teamId,
      type: {
        in: ["DUPLICATE_ROSTER", "INVALID_STEAM_ID"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ violations });
}
