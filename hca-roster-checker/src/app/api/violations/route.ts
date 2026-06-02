import { ViolationStatus, ViolationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
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
      type: violationType,
      status: violationStatus,
    },
    include: {
      team: true,
      player: true,
      match: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ violations });
}
