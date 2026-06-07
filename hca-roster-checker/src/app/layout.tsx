import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { RerunViolationsButton } from "@/components/RerunViolationsButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getServerSession } from "@/lib/auth/serverSession";
import { getRootAdminUsername, isRootOrga } from "@/lib/auth/rootAdmin";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HCA Roster Checker",
  description: "Roster and match validation for Hell Let Loose HCA tournaments",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  const canSeeOrgaAccounts = session ? isRootOrga(session) : false;
  const canRerunViolations =
    session?.role === "HCA_ORGA" ||
    session?.username.toLowerCase() === getRootAdminUsername().toLowerCase();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-[var(--foreground)] transition-colors duration-300">
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[-8rem] top-[-6rem] h-72 w-72 rounded-full bg-cyan-400/18 blur-3xl" />
            <div className="absolute right-[-6rem] top-24 h-80 w-80 rounded-full bg-blue-500/18 blur-3xl" />
            <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
          </div>

          <header className="relative border-b border-white/10 bg-[var(--panel)]/72 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
              <div className="space-y-1">
                <Link href="/dashboard" prefetch={false} className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  HCA Roster Checker
                </Link>
                <p className="text-xs text-[var(--muted)]">Roster control, match review, and violation handling</p>
              </div>
              {session ? (
                <nav className="flex flex-wrap items-center justify-end gap-2 text-sm font-medium text-[var(--muted)]">
                  <Link href="/dashboard" prefetch={false} className="nav-link">
                    Dashboard
                  </Link>
                  <Link href="/teams" prefetch={false} className="nav-link">
                    {session.role === "TEAM_REP" ? "Your Team" : "Teams"}
                  </Link>
                  {session.role === "HCA_ORGA" ? (
                    <>
                      <Link href="/matches" prefetch={false} className="nav-link">
                        Matches
                      </Link>
                      <Link href="/players" prefetch={false} className="nav-link">
                        Player Lookup
                      </Link>
                      <Link href="/admin/team-reps" prefetch={false} className="nav-link">
                        Team Reps
                      </Link>
                      {canSeeOrgaAccounts ? (
                        <Link href="/admin/orga-accounts" prefetch={false} className="nav-link">
                          HCA Orga
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <Link href="/matches" prefetch={false} className="nav-link">
                      Matches
                    </Link>
                  )}
                  <Link href="/violations" prefetch={false} className="nav-link">
                    Violations
                  </Link>
                  <ThemeToggle />
                  {canRerunViolations ? <RerunViolationsButton /> : null}
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">
                    {session.role === "HCA_ORGA" ? "HCA ORGA" : "Team Rep"}
                  </span>
                  <LogoutButton />
                </nav>
              ) : null}
            </div>
          </header>

          <main className="relative mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
