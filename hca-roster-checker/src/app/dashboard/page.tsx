import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totalTeams, totalPlayers, openViolations, lockedRosters] = await Promise.all([
    prisma.team.count(),
    prisma.player.count(),
    prisma.violation.count({ where: { status: "OPEN" } }),
    prisma.rosterEntry.count({ where: { status: "ACTIVE", lockedAt: { not: null } } }),
  ]);

  const cards = [
    { label: "Total teams", value: totalTeams },
    { label: "Total players", value: totalPlayers },
    { label: "Open violations", value: openViolations },
    { label: "Locked roster entries", value: lockedRosters },
  ];

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tournament Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        Source of truth is the web app + PostgreSQL database. Discord integration is intentionally deferred.
      </p>
    </section>
  );
}
