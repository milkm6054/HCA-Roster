import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth/serverSession";
import { isLikelyGamespassId } from "@/lib/steam/steamIds";

export const dynamic = "force-dynamic";

function getInitials(label: string): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || "N/A";
}

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session) {
    return null;
  }

  const [totalTeams, totalRegisteredPlayers, yourPlayerTotal, teamRepContacts, currentTeam, playedMatches, teamViolations, teamsForGraphic] = await Promise.all([
    prisma.team.count(),
    prisma.rosterEntry.count({
      where: {
        status: "ACTIVE",
      },
    }),
    session.role === "TEAM_REP" && session.teamId
      ? prisma.rosterEntry.count({
          where: {
            teamId: session.teamId,
            status: "ACTIVE",
          },
        })
      : Promise.resolve(0),
    session.role === "TEAM_REP" && session.teamId
      ? prisma.user.findMany({
          where: {
            role: "TEAM_REP",
            teamId: session.teamId,
            isActive: true,
          },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        })
      : Promise.resolve([]),
    session.role === "TEAM_REP" && session.teamId
      ? prisma.team.findUnique({
          where: { id: session.teamId },
          select: { name: true, tag: true, logoDataUrl: true },
        })
      : Promise.resolve(null),
    session.role === "TEAM_REP" && session.teamId
      ? prisma.match.count({
          where: {
            OR: [{ teamAId: session.teamId }, { teamBId: session.teamId }],
            matchPlayers: {
              some: {},
            },
          },
        })
      : Promise.resolve(0),
    session.role === "TEAM_REP" && session.teamId
      ? prisma.violation.findMany({
          where: {
            status: "OPEN",
            teamId: session.teamId,
            NOT: {
              type: "NEW_ACCOUNT",
            },
          },
          select: {
            rawSteamId: true,
          },
        })
      : Promise.resolve([]),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        tag: true,
        logoDataUrl: true,
      },
    }),
  ]);

  const filteredTeamViolations = teamViolations.filter(
    (violation) => !isLikelyGamespassId(violation.rawSteamId || ""),
  ).length;

  const cards =
    session.role === "TEAM_REP"
      ? [
          { label: "Number of teams registered", value: totalTeams },
          { label: "Total players registered", value: totalRegisteredPlayers },
          { label: "Your player total", value: yourPlayerTotal },
          { label: "Team violations", value: filteredTeamViolations },
          { label: "Matches played", value: playedMatches },
          { label: "Matches won", value: "Not tracked" },
          { label: "Matches lost", value: "Not tracked" },
        ]
      : [
          { label: "Total teams", value: totalTeams },
          { label: "Total players registered", value: totalRegisteredPlayers },
          { label: "Active team violations", value: filteredTeamViolations },
          { label: "Matches played", value: playedMatches },
        ];

  return (
    <section className="space-y-6">
      <div className="surface-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-500">Overview</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {session.role === "TEAM_REP" ? `${currentTeam?.name || "Your Team"} Dashboard` : "Tournament Dashboard"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm muted-copy">
          {session.role === "TEAM_REP"
            ? `Live registration and validation overview for ${currentTeam?.name || "your team"}.`
            : "Live registration and validation overview for roster management across the competition."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="surface-card p-5">
            <p className="text-xs uppercase tracking-[0.2em] muted-copy">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      {session.role === "TEAM_REP" ? (
        <p className="text-sm muted-copy">
          Wins and losses are shown as not tracked because match outcomes are not stored in the current data model yet.
        </p>
      ) : null}

      {session.role === "TEAM_REP" ? (
        <section className="surface-card space-y-3 p-5">
          <h2 className="text-lg font-semibold tracking-tight">Your Team Reps</h2>
          <p className="text-sm muted-copy">
            Team: {currentTeam?.name || "Unassigned"}
          </p>
          <ul className="space-y-2 text-sm">
            {teamRepContacts.map((rep) => (
              <li key={rep.id} className="surface-card-soft px-3 py-2">
                <span className="font-medium">{rep.displayName || rep.username}</span>
                {rep.displayName ? <span className="ml-2 muted-copy">({rep.username})</span> : null}
              </li>
            ))}
            {teamRepContacts.length === 0 ? (
              <li className="surface-card-soft px-3 py-2 muted-copy">
                No team reps found for your team.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-500">Teams</p>
          </div>
          <p className="text-sm muted-copy">Every registered team appears here. Logos update as teams upload them.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teamsForGraphic.map((team) => (
            <div key={team.id} className="surface-card-soft flex items-center gap-3 px-4 py-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/6 text-sm font-semibold text-[var(--muted)]">
                {team.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logoDataUrl} alt={`${team.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <span>{getInitials(team.tag || team.name || "N/A")}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{team.name}</p>
                <p className="text-xs muted-copy">{team.logoDataUrl ? (team.tag || "Custom logo") : "N/A Logo"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="gallery-quote" aria-label="Quote">
        <blockquote>
          &ldquo;Do not fall into the well of egoism and conceit when you taste some victory water.&rdquo;
        </blockquote>
        <cite>The Lion</cite>
      </section>
    </section>
  );
}
