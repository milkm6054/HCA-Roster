import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { isRootOrga } from "@/lib/auth/rootAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgaAccounts = await prisma.user.findMany({
    where: { role: UserRole.HCA_ORGA },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      createdAt: true,
      isActive: true,
    },
  });

  return NextResponse.json({
    orgaAccounts,
    rootUsername: auth.session.username,
    canCreateOrga: isRootOrga(auth.session),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  if (!isRootOrga(auth.session)) {
    return NextResponse.json({ error: "Only the root admin account can create HCA ORGA accounts." }, { status: 403 });
  }

  const body = (await request.json()) as {
    username?: string;
    password?: string;
    displayName?: string;
    email?: string;
  };

  const username = body.username?.trim();
  const password = body.password?.trim();
  const displayName = body.displayName?.trim() || null;
  const email = body.email?.trim().toLowerCase() || null;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const exists = await prisma.user.findFirst({
    where: {
      OR: [
        {
          username: {
            equals: username,
            mode: "insensitive",
          },
        },
        ...(email ? [{ email }] : []),
      ],
    },
    select: { id: true },
  });

  if (exists) {
    return NextResponse.json({ error: "Username or email already in use." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const orga = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      displayName,
      role: UserRole.HCA_ORGA,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      createdAt: true,
      isActive: true,
    },
  });

  return NextResponse.json({ orga }, { status: 201 });
}
