"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Team = { id: string; name: string; tag?: string | null };
type SessionRole = "HCA_ORGA" | "TEAM_REP" | null;
type Match = {
  id: string;
  week: number;
  mapName?: string | null;
  midpointName?: string | null;
  gameUrl?: string | null;
  playedAt?: string | null;
  axisTeamId?: string | null;
  alliesTeamId?: string | null;
  status: "SCHEDULED" | "READY_TO_IMPORT" | "IMPORTED" | "NEEDS_REVIEW";
  teamA: Team;
  teamB: Team;
  _count: { matchPlayers: number; violations: number };
};

function getMatchStatusLabel(status: Match["status"]) {
  if (status === "READY_TO_IMPORT") return "Ready to import";
  if (status === "IMPORTED") return "Imported";
  if (status === "NEEDS_REVIEW") return "Needs review";
  return "Scheduled";
}

export default function MatchesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [role, setRole] = useState<SessionRole>(null);
  const [week, setWeek] = useState(1);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refreshData() {
    const [meRes, teamsRes, matchesRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/teams"),
      fetch("/api/matches"),
    ]);

    const meData = await meRes.json();
    const teamsData = await teamsRes.json();
    const matchesData = await matchesRes.json();
    setRole(meData.session?.role || null);
    setTeams(teamsData.teams || []);
    setMatches(matchesData.matches || []);

    if (teamsData.teams?.[0] && !teamAId) {
      setTeamAId(teamsData.teams[0].id);
    }

    if (teamsData.teams?.[1] && !teamBId) {
      setTeamBId(teamsData.teams[1].id);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const [meRes, teamsRes, matchesRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/teams"),
        fetch("/api/matches"),
      ]);

      const meData = await meRes.json();
      const teamsData = await teamsRes.json();
      const matchesData = await matchesRes.json();

      if (!active) {
        return;
      }

      setRole(meData.session?.role || null);
      setTeams(teamsData.teams || []);
      setMatches(matchesData.matches || []);

      if (teamsData.teams?.[0]) {
        setTeamAId((prev) => prev || teamsData.teams[0].id);
      }

      if (teamsData.teams?.[1]) {
        setTeamBId((prev) => prev || teamsData.teams[1].id);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function createMatch(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week, teamAId, teamBId }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create match.");
      return;
    }

    await refreshData();
  }

  async function deleteMatch(match: Match) {
    const confirmed = window.confirm(`Delete Week ${match.week}: ${match.teamA.name} vs ${match.teamB.name}?`);
    if (!confirmed) {
      return;
    }

    setBusyMatchId(match.id);
    setError("");

    try {
      const res = await fetch(`/api/matches/${match.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete match.");
        return;
      }

      await refreshData();
    } finally {
      setBusyMatchId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-white/10 bg-[var(--panel)]/85 p-6 shadow-[var(--shadow)] backdrop-blur-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-500">Match control</p>
            <h1 className="text-3xl font-semibold tracking-tight">Matches</h1>
            <p className="max-w-2xl text-sm text-[var(--muted)]">
              Create fixtures, review logged players, and remove stale or mistaken matches without leaving the schedule view.
            </p>
          </div>

          <div className="grid min-w-[240px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Total matches</p>
              <p className="mt-2 text-3xl font-semibold">{matches.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Teams ready</p>
              <p className="mt-2 text-3xl font-semibold">{teams.length}</p>
            </div>
          </div>
        </div>
      </div>

      {role === "HCA_ORGA" ? (
        <form onSubmit={createMatch} className="grid gap-3 rounded-[24px] border border-white/10 bg-[var(--panel)]/85 p-5 shadow-[var(--shadow)] backdrop-blur-xl md:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Week</span>
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Team 1</span>
          <select value={teamAId} onChange={(e) => setTeamAId(e.target.value)} required>
            <option value="">Select team 1</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Team 2</span>
          <select value={teamBId} onChange={(e) => setTeamBId(e.target.value)} required>
            <option value="">Select team 2</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button className="w-full border-cyan-400/30 bg-cyan-400/90 px-4 py-2.5 text-slate-950 shadow-lg shadow-cyan-500/20">
            Create fixture
          </button>
        </div>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[var(--panel)]/85 shadow-[var(--shadow)] backdrop-blur-xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/5 text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Week</th>
              <th className="px-4 py-3">Fixture</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sides</th>
              <th className="px-4 py-3">Map</th>
              <th className="px-4 py-3">Midpoint</th>
              <th className="px-4 py-3">Players logged</th>
              <th className="px-4 py-3">Violations</th>
              <th className="px-4 py-3">Link</th>
              <th className="px-4 py-3">Open</th>
              {role === "HCA_ORGA" ? <th className="px-4 py-3">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} className="border-t border-white/8">
                <td className="px-4 py-3">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                    Week {match.week}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {match.teamA.name} vs {match.teamB.name}
                </td>
                <td className="px-4 py-3">{getMatchStatusLabel(match.status)}</td>
                <td className="px-4 py-3">
                  Axis: {[match.teamA, match.teamB].find((team) => team.id === match.axisTeamId)?.name || "TBD"}
                  <br />
                  Allies: {[match.teamA, match.teamB].find((team) => team.id === match.alliesTeamId)?.name || "TBD"}
                </td>
                <td className="px-4 py-3">{match.mapName || "-"}</td>
                <td className="px-4 py-3">{match.midpointName || "-"}</td>
                <td className="px-4 py-3">{match._count.matchPlayers}</td>
                <td className="px-4 py-3">{match._count.violations}</td>
                <td className="px-4 py-3">
                  {match.gameUrl ? (
                    <a href={match.gameUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline decoration-cyan-400/50 underline-offset-4">
                      View
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/matches/${match.id}`} className="text-cyan-400 underline decoration-cyan-400/50 underline-offset-4">
                    Manage
                  </Link>
                </td>
                {role === "HCA_ORGA" ? (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="border-red-400/20 bg-red-500/12 px-3 py-1.5 text-xs text-red-200"
                      onClick={() => deleteMatch(match)}
                      disabled={busyMatchId === match.id}
                    >
                      {busyMatchId === match.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {matches.length === 0 ? (
              <tr>
                <td colSpan={role === "HCA_ORGA" ? 10 : 9} className="px-4 py-10 text-center text-[var(--muted)]">
                  No matches created yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
