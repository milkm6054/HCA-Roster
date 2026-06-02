import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

function withClearedCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  return withClearedCookie(response);
}

export async function POST() {
  return withClearedCookie(NextResponse.json({ ok: true }));
}
