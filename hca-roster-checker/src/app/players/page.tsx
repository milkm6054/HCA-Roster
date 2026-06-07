"use client";

import Link from "next/link";
import { useState } from "react";

type PlayerLookupResult = {
  player: {
    steamId64: string;
    displayName?: string | null;
    averageStats: {
      matches: number;
      kills: number;
      deaths: number;
      kpm: number;
      dpm: number;
      kpd: number;
    };
    matchStats: Array<{
      id: string;
      matchId: string;
      teamName: string;
      week?: number | null;
      axis?: string | null;
      allies?: string | null;
      mapName?: string | null;
      midpointName?: string | null;
      gameUrl?: string | null;
      kills?: number | null;
      deaths?: number | null;
      kpd?: number | null;
      kpm?: number | null;
      dpm?: number | null;
    }>;
  };
};

function formatAverage(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

export default function PlayersPage() {
  const [steamId, setSteamId] = useState("");
  const [result, setResult] = useState<PlayerLookupResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookupPlayer(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/players/lookup?steamId=${encodeURIComponent(steamId)}`);
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(data.error || "Failed to look up player.");
        return;
      }

      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="surface-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-500">Lookup</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Player Stats</h1>
        <p className="mt-2 max-w-2xl text-sm muted-copy">
          Search by Steam ID to review a player&apos;s recorded match stats across all imported games.
        </p>
      </div>

      <form onSubmit={lookupPlayer} className="surface-card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[280px] flex-1 space-y-2">
          <span className="text-xs font-medium uppercase tracking-[0.16em] muted-copy">Steam ID</span>
          <input
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            placeholder="SteamID64 / SteamID / SteamID3"
            required
          />
        </label>
        <button className="primary-button px-4 py-2" disabled={busy}>
          {busy ? "Searching..." : "Search player"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {result ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="surface-card p-5 xl:col-span-2">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Player</p>
              <p className="mt-3 text-2xl font-semibold">{result.player.displayName || result.player.steamId64}</p>
              <p className="mt-2 font-mono text-xs muted-copy">{result.player.steamId64}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Matches</p>
              <p className="mt-3 text-3xl font-semibold">{result.player.averageStats.matches}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Avg Kills</p>
              <p className="mt-3 text-3xl font-semibold">{formatAverage(result.player.averageStats.kills)}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Avg Deaths</p>
              <p className="mt-3 text-3xl font-semibold">{formatAverage(result.player.averageStats.deaths)}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Avg KPD</p>
              <p className="mt-3 text-3xl font-semibold">{formatAverage(result.player.averageStats.kpd)}</p>
            </div>
            <div className="surface-card p-5">
              <p className="text-xs uppercase tracking-[0.2em] muted-copy">Avg KPM</p>
              <p className="mt-3 text-3xl font-semibold">{formatAverage(result.player.averageStats.kpm)}</p>
            </div>
          </div>

          <div className="surface-table">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3">Week</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Map</th>
                  <th className="px-4 py-3">Midpoint</th>
                  <th className="px-4 py-3">K</th>
                  <th className="px-4 py-3">D</th>
                  <th className="px-4 py-3">KPD</th>
                  <th className="px-4 py-3">KPM</th>
                  <th className="px-4 py-3">DPM</th>
                  <th className="px-4 py-3">Open</th>
                </tr>
              </thead>
              <tbody>
                {result.player.matchStats.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3">{entry.week ?? "-"}</td>
                    <td className="px-4 py-3">{entry.teamName}</td>
                    <td className="px-4 py-3">
                      Axis: {entry.axis || "-"}
                      <br />
                      Allies: {entry.allies || "-"}
                    </td>
                    <td className="px-4 py-3">{entry.mapName || "-"}</td>
                    <td className="px-4 py-3">{entry.midpointName || "-"}</td>
                    <td className="px-4 py-3">{entry.kills ?? "-"}</td>
                    <td className="px-4 py-3">{entry.deaths ?? "-"}</td>
                    <td className="px-4 py-3">{entry.kpd?.toFixed(2) ?? "-"}</td>
                    <td className="px-4 py-3">{entry.kpm?.toFixed(2) ?? "-"}</td>
                    <td className="px-4 py-3">{entry.dpm?.toFixed(2) ?? "-"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/matches/${entry.matchId}`} className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-4">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {result.player.matchStats.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center muted-copy">
                      No recorded match stats for this player yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
