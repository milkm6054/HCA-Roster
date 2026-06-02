import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/me"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublicPage = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isPublicApi = PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isAsset = pathname.startsWith("/_next") || pathname.startsWith("/favicon");

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isPublicPage) {
    if (session) {
      const next = request.nextUrl.searchParams.get("next");
      const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  if (isAsset || isPublicApi) {
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (session.role === "TEAM_REP" && pathname.startsWith("/matches")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session.role === "TEAM_REP" && pathname === "/teams") {
    if (session.teamId) {
      return NextResponse.redirect(new URL(`/teams/${session.teamId}`, request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session.role === "TEAM_REP" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
