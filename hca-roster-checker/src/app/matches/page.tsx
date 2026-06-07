"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HLL_MAPS } from "@/lib/matches/hllMaps";

type Team = { id: string; name: string; tag?: string | null };
type SessionRole = "HCA_ORGA" | "TEAM_REP" | null;
type Match = {
  id: string;
  week: number;
  mapName?: string | null;
  midpointName?: string | null;
  gameUrl?: string | null;
  playedAt?: string | null;
  teamA: Team;
  teamB: Team;
  _count: { matchPlayers: number; violations: number };
};
type StreamerCandidate = {
  steamId: string;
  displayName?: string | null;
  team: string;
  kills?: number | null;
  deaths?: number | null;
  kpd?: number | null;
  kpm?: number | null;
  dpm?: number | null;
  timeSeconds?: number | null;
};
type CreateMatchImportPrompt = {
  matchId: string;
  matchupLabel: string;
  overflowCount: number;
  totalPlayersFound: number;
  candidates: StreamerCandidate[];
  suggestedSteamIds: string[];
};

export default function MatchesPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [role, setRole] = useState<SessionRole>(null);
  const [week, setWeek] = useState(1);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [mapName, setMapName] = useState<(typeof HLL_MAPS)[number]>(HLL_MAPS[0]);
  const [midpointName, setMidpointName] = useState("");
  const [gameUrl, setGameUrl] = useState("");
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [importPrompt, setImportPrompt] = useState<CreateMatchImportPrompt | null>(null);
  const [selectedStreamerIds, setSelectedStreamerIds] = useState<string[]>([]);
  const [busyPromptImport, setBusyPromptImport] = useState(false);

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
    setImportPrompt(null);
    setSelectedStreamerIds([]);

    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ week, teamAId, teamBId, mapName, midpointName, gameUrl }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create match.");
      return;
    }

    await refreshData();
    if (data.needsStreamerSelection && data.match) {
      const suggestedSteamIds = (data.suggestedSteamIds || []).slice(0, data.overflowCount);
      const axisTeamName = teams.find((team) => team.id === teamAId)?.name || "Axis";
      const alliesTeamName = teams.find((team) => team.id === teamBId)?.name || "Allies";
      setImportPrompt({
        matchId: data.match.id,
        matchupLabel: `${axisTeamName} vs ${alliesTeamName}`,
        overflowCount: data.overflowCount,
        totalPlayersFound: data.totalPlayersFound,
        candidates: data.candidates || [],
        suggestedSteamIds,
      });
      setSelectedStreamerIds(suggestedSteamIds);
    }
    setMidpointName("");
    setGameUrl("");
  }

  async function confirmCreatedMatchImport() {
    if (!importPrompt) return;

    setBusyPromptImport(true);
    setError("");

    try {
      const res = await fetch(`/api/matches/${importPrompt.matchId}/stats/import-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedSteamIds: selectedStreamerIds }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to import stats for the new match.");
        if (data.needsStreamerSelection) {
          const suggestedSteamIds = (data.suggestedSteamIds || []).slice(0, data.overflowCount);
          setImportPrompt({
            matchId: importPrompt.matchId,
            matchupLabel: importPrompt.matchupLabel,
            overflowCount: data.overflowCount,
            totalPlayersFound: data.totalPlayersFound,
            candidates: data.candidates || [],
            suggestedSteamIds,
          });
          setSelectedStreamerIds(suggestedSteamIds);
        }
        return;
      }

      setImportPrompt(null);
      setSelectedStreamerIds([]);
      await refreshData();
    } finally {
      setBusyPromptImport(false);
    }
  }

  function toggleStreamerSelection(steamId: string) {
    setSelectedStreamerIds((current) =>
      current.includes(steamId) ? current.filter((value) => value !== steamId) : [...current, steamId],
    );
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
        <form onSubmit={createMatch} className="grid gap-3 rounded-[24px] border border-white/10 bg-[var(--panel)]/85 p-5 shadow-[var(--shadow)] backdrop-blur-xl md:grid-cols-6">
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
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Axis</span>
          <select value={teamAId} onChange={(e) => setTeamAId(e.target.value)} required>
            <option value="">Select Axis team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Allies</span>
          <select value={teamBId} onChange={(e) => setTeamBId(e.target.value)} required>
            <option value="">Select Allies team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Map</span>
          <select value={mapName} onChange={(e) => setMapName(e.target.value as (typeof HLL_MAPS)[number])} required>
            {HLL_MAPS.map((map) => (
              <option key={map} value={map}>
                {map}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Midpoint</span>
          <input
            value={midpointName}
            onChange={(e) => setMidpointName(e.target.value)}
            placeholder="Official strongpoint name"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">Game link</span>
          <input
            type="url"
            value={gameUrl}
            onChange={(e) => setGameUrl(e.target.value)}
            placeholder="http://95.216.175.159:7014/games/33023"
          />
        </label>

        <div className="flex items-end md:col-span-6">
          <button className="w-full border-cyan-400/30 bg-cyan-400/90 px-4 py-2.5 text-slate-950 shadow-lg shadow-cyan-500/20">
            Create match
          </button>
        </div>
        </form>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {importPrompt ? (
        <div className="space-y-3 rounded-[24px] border border-amber-400/20 bg-[var(--panel)]/92 p-5 text-sm text-[var(--foreground)] shadow-[var(--shadow)] backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-semibold text-amber-200">Finish automatic match import</h2>
            <p className="mt-1 text-[var(--muted)]">
              {importPrompt.matchupLabel} was created with {importPrompt.totalPlayersFound} linked players. Select{" "}
              {importPrompt.overflowCount} streamer{importPrompt.overflowCount === 1 ? "" : "s"} to exclude so the remaining 98 players are stored automatically.
            </p>
            {importPrompt.suggestedSteamIds.length ? (
              <p className="mt-1 text-xs text-amber-200/80">
                Zero-kill players are preselected as the likely streamer account{importPrompt.suggestedSteamIds.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>

          <div className="max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/5 text-amber-100/80">
                <tr>
                  <th className="px-3 py-2">Exclude</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Steam ID</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">K</th>
                  <th className="px-3 py-2">D</th>
                  <th className="px-3 py-2">KPM</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {importPrompt.candidates.map((candidate) => (
                  <tr key={candidate.steamId} className="border-t border-white/8">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedStreamerIds.includes(candidate.steamId)}
                        onChange={() => toggleStreamerSelection(candidate.steamId)}
                      />
                    </td>
                    <td className="px-3 py-2">{candidate.displayName || "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{candidate.steamId}</td>
                    <td className="px-3 py-2 capitalize text-[var(--muted)]">{candidate.team}</td>
                    <td className="px-3 py-2">{candidate.kills ?? "-"}</td>
                    <td className="px-3 py-2">{candidate.deaths ?? "-"}</td>
                    <td className="px-3 py-2">{candidate.kpm?.toFixed(2) ?? "-"}</td>
                    <td className="px-3 py-2">
                      {candidate.timeSeconds ? `${Math.round(candidate.timeSeconds / 60)} min` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="border-cyan-400/30 bg-cyan-400/90 px-4 py-2.5 text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              disabled={busyPromptImport || selectedStreamerIds.length !== importPrompt.overflowCount}
              onClick={confirmCreatedMatchImport}
            >
              {busyPromptImport ? "Importing..." : `Exclude ${importPrompt.overflowCount} and finish import`}
            </button>
            <p className="text-xs text-amber-200/80">
              Selected {selectedStreamerIds.length} of {importPrompt.overflowCount}
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[var(--panel)]/85 shadow-[var(--shadow)] backdrop-blur-xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/5 text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Week</th>
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
                  Axis: {match.teamA.name}
                  <br />
                  Allies: {match.teamB.name}
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
                <td colSpan={role === "HCA_ORGA" ? 9 : 8} className="px-4 py-10 text-center text-[var(--muted)]">
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
