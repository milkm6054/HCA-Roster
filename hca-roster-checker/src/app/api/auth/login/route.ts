import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ensureDefaultAdminAccount } from "@/lib/auth/bootstrapAdmin";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
  };

  if (!body.username || !body.password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  await ensureDefaultAdminAccount();

  const user = await prisma.user.findFirst({
    where: {
      username: {
        equals: body.username.trim(),
        mode: "insensitive",
      },
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!user.username) {
    return NextResponse.json(
      { error: "Account is not yet migrated to username login. Contact an admin." },
      { status: 400 },
    );
  }

  if (user.role === "TEAM_REP" && !user.teamId) {
    return NextResponse.json({ error: "Team representative account is missing team assignment." }, { status: 400 });
  }

  const token = await createSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    teamId: user.teamId ?? undefined,
    displayName: user.displayName ?? undefined,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
