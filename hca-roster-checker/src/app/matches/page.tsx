"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Team = { id: string; name: string; tag?: string | null };
type Match = {
  id: string;
  week: number;
  playedAt?: string | null;
  teamA: Team;
  teamB: Team;
  _count: { matchPlayers: number; violations: number };
};

export default function MatchesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [week, setWeek] = useState(1);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");

  async function refreshData() {
    const [teamsRes, matchesRes] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/matches"),
    ]);

    const teamsData = await teamsRes.json();
    const matchesData = await matchesRes.json();
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
      const [teamsRes, matchesRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/matches"),
      ]);

      const teamsData = await teamsRes.json();
      const matchesData = await matchesRes.json();

      if (!active) {
        return;
      }

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

    await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week, teamAId, teamBId }),
    });

    await refreshData();
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>

      <form onSubmit={createMatch} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
        <input
          type="number"
          min={1}
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          required
        />

        <select value={teamAId} onChange={(e) => setTeamAId(e.target.value)} required>
          <option value="">Select Team A</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <select value={teamBId} onChange={(e) => setTeamBId(e.target.value)} required>
          <option value="">Select Team B</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        <div className="md:col-span-2">
          <button className="bg-slate-900 px-4 py-2 text-white">Create match</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Week</th>
              <th className="px-4 py-3">Teams</th>
              <th className="px-4 py-3">Players logged</th>
              <th className="px-4 py-3">Violations</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{match.week}</td>
                <td className="px-4 py-3">
                  {match.teamA.name} vs {match.teamB.name}
                </td>
                <td className="px-4 py-3">{match._count.matchPlayers}</td>
                <td className="px-4 py-3">{match._count.violations}</td>
                <td className="px-4 py-3">
                  <Link href={`/matches/${match.id}`} className="text-slate-700 underline">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
