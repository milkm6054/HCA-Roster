import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const violations = await prisma.violation.findMany({
    where: {
      teamId,
      type: {
        in: ["DUPLICATE_ROSTER", "INVALID_STEAM_ID", "NEW_ACCOUNT"],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ violations });
}
