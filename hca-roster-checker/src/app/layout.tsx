import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { getServerSession } from "@/lib/auth/serverSession";
import { isRootOrga } from "@/lib/auth/rootAdmin";
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

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-100 text-slate-900">
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/dashboard" prefetch={false} className="text-lg font-semibold tracking-tight">
                HCA Roster Checker
              </Link>
              {session ? (
                <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
                  <Link href="/dashboard" prefetch={false} className="hover:text-slate-900">
                    Dashboard
                  </Link>
                  <Link href="/teams" prefetch={false} className="hover:text-slate-900">
                    {session.role === "TEAM_REP" ? "Your Team" : "Teams"}
                  </Link>
                  {session.role === "HCA_ORGA" ? (
                    <>
                      <Link href="/matches" prefetch={false} className="hover:text-slate-900">
                        Matches
                      </Link>
                      <Link href="/admin/team-reps" prefetch={false} className="hover:text-slate-900">
                        Team Reps
                      </Link>
                      {canSeeOrgaAccounts ? (
                        <Link href="/admin/orga-accounts" prefetch={false} className="hover:text-slate-900">
                          HCA Orga
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                  <Link href="/violations" prefetch={false} className="hover:text-slate-900">
                    Violations
                  </Link>
                  <span className="text-xs text-slate-500">
                    {session.role === "HCA_ORGA" ? "HCA ORGA" : "Team Rep"}
                  </span>
                  <LogoutButton />
                </nav>
              ) : null}
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
