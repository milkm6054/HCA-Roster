import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reps = await prisma.user.findMany({
    where: { role: UserRole.TEAM_REP },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      isActive: true,
      createdAt: true,
      team: {
        select: { id: true, name: true, tag: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ reps });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    username?: string;
    password?: string;
    displayName?: string;
    email?: string;
    teamId?: string;
  };

  const username = body.username?.trim();
  const password = body.password?.trim();
  const teamId = body.teamId?.trim();
  const email = body.email?.toLowerCase().trim() || null;

  if (!username || !password || !teamId) {
    return NextResponse.json({ error: "username, password, and teamId are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ username: { equals: username, mode: "insensitive" } }, ...(email ? [{ email }] : [])],
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Username or email is already in use." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const rep = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      displayName: body.displayName?.trim() || null,
      role: UserRole.TEAM_REP,
      teamId,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      isActive: true,
      createdAt: true,
      team: {
        select: { id: true, name: true, tag: true },
      },
    },
  });

  return NextResponse.json({ rep }, { status: 201 });
}
