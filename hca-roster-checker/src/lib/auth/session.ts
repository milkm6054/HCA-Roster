import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "hca_session";

export type AuthSession = {
  userId: string;
  username: string;
  role: "HCA_ORGA" | "TEAM_REP";
  teamId?: string;
  displayName?: string;
};

function getSessionSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error("AUTH_SECRET is not set.");
  }
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(session: AuthSession): Promise<string> {
  return await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const verified = await jwtVerify(token, getSessionSecret());
    return verified.payload as unknown as AuthSession;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: Request): Promise<AuthSession | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  const token = cookie.split("=").slice(1).join("=");
  return verifySessionToken(token);
}
