import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getServerSession } from "@/lib/auth/serverSession";
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

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-100 text-slate-900">
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
                HCA Roster Checker
              </Link>
              {session ? (
                <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
                  <Link href="/dashboard" className="hover:text-slate-900">
                    Dashboard
                  </Link>
                  <Link href="/teams" className="hover:text-slate-900">
                    Teams
                  </Link>
                  {session.role === "HCA_ORGA" ? (
                    <>
                      <Link href="/matches" className="hover:text-slate-900">
                        Matches
                      </Link>
                      <Link href="/admin/team-reps" className="hover:text-slate-900">
                        Accounts
                      </Link>
                    </>
                  ) : null}
                  <Link href="/violations" className="hover:text-slate-900">
                    Violations
                  </Link>
                  <span className="text-xs text-slate-500">
                    {session.role === "HCA_ORGA" ? "HCA ORGA" : "Team Rep"}
                  </span>
                  <Link href="/api/auth/logout" className="border border-slate-300 bg-white px-3 py-1 text-xs">
                    Logout
                  </Link>
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
