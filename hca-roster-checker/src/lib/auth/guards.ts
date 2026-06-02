import { NextResponse } from "next/server";
import type { AuthSession } from "@/lib/auth/session";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function requireApiSession(request: Request): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; response: NextResponse }
> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, session };
}

export function isOrga(session: AuthSession): boolean {
  return session.role === "HCA_ORGA";
}

export function canAccessTeam(session: AuthSession, teamId: string): boolean {
  if (isOrga(session)) return true;
  return session.role === "TEAM_REP" && session.teamId === teamId;
}
