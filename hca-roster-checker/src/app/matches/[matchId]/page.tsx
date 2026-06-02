"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type MatchData = {
  id: string;
  week: number;
  teamA: { name: string; tag?: string | null };
  teamB: { name: string; tag?: string | null };
  matchPlayers: Array<{
    id: string;
    rawSteamId: string;
    steamId64?: string | null;
    role?: string | null;
    kills?: number | null;
    deaths?: number | null;
    team: { name: string };
  }>;
};

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [csvText, setCsvText] = useState("team,steam_id,kills,deaths,role\n");
  const [file, setFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<Record<string, unknown> | null>(null);

  async function refreshMatch() {
    const res = await fetch(`/api/matches/${matchId}`);
    const data = await res.json();
    setMatch(data.match || null);
  }

  useEffect(() => {
    let active = true;
    if (!matchId) return;

    void (async () => {
      const res = await fetch(`/api/matches/${matchId}`);
      const data = await res.json();
      if (active) {
        setMatch(data.match || null);
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId]);

  async function uploadStats(event: React.FormEvent) {
    event.preventDefault();
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("csvText", csvText);
    }

    const res = await fetch(`/api/matches/${matchId}/stats/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setUploadSummary(data);
    await refreshMatch();
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Match week {match?.week}: {match?.teamA.name} vs {match?.teamB.name}
      </h1>

      <form onSubmit={uploadStats} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Upload match stats CSV</h2>
        <p className="text-xs text-slate-500">Expected headers: team, steam_id, kills, deaths, role</p>

        <textarea className="h-40 w-full" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="bg-slate-900 px-4 py-2 text-white">Upload stats</button>
      </form>

      {uploadSummary ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-semibold">Match upload summary</h3>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(uploadSummary, null, 2)}</pre>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Steam ID input</th>
              <th className="px-4 py-3">SteamID64</th>
              <th className="px-4 py-3">K</th>
              <th className="px-4 py-3">D</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {match?.matchPlayers.map((player) => (
              <tr key={player.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{player.team.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{player.rawSteamId}</td>
                <td className="px-4 py-3 font-mono text-xs">{player.steamId64 || "-"}</td>
                <td className="px-4 py-3">{player.kills ?? "-"}</td>
                <td className="px-4 py-3">{player.deaths ?? "-"}</td>
                <td className="px-4 py-3">{player.role || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
