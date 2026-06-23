"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { HLL_MAPS } from "@/lib/matches/hllMaps";

type MatchData = {
  id: string;
  week: number;
  mapName?: string | null;
  midpointName?: string | null;
  gameUrl?: string | null;
  playedAt?: string | null;
  axisTeamId?: string | null;
  alliesTeamId?: string | null;
  status: "SCHEDULED" | "READY_TO_IMPORT" | "IMPORTED" | "NEEDS_REVIEW";
  teamA: { id: string; name: string; tag?: string | null };
  teamB: { id: string; name: string; tag?: string | null };
  matchPlayers: Array<{
    id: string;
    rawSteamId: string;
    steamId64?: string | null;
    displayName?: string | null;
    role?: string | null;
    kills?: number | null;
    deaths?: number | null;
    killDeathRatio?: number | null;
    killsPerMinute?: number | null;
    deathsPerMinute?: number | null;
    team: { name: string };
  }>;
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

type StreamerPromptState = {
  overflowCount: number;
  totalPlayersFound: number;
  candidates: StreamerCandidate[];
  suggestedSteamIds: string[];
};

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [csvText, setCsvText] = useState("team,steam_id,kills,deaths,role\n");
  const [file, setFile] = useState<File | null>(null);
  const [uploadSummary, setUploadSummary] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busyImport, setBusyImport] = useState(false);
  const [busySaveDetails, setBusySaveDetails] = useState(false);
  const [streamerPrompt, setStreamerPrompt] = useState<StreamerPromptState | null>(null);
  const [selectedStreamerIds, setSelectedStreamerIds] = useState<string[]>([]);
  const [editAxisTeamId, setEditAxisTeamId] = useState("");
  const [editAlliesTeamId, setEditAlliesTeamId] = useState("");
  const [editMapName, setEditMapName] = useState("");
  const [editMidpointName, setEditMidpointName] = useState("");
  const [editGameUrl, setEditGameUrl] = useState("");

  function setMatchWithEditor(nextMatch: MatchData | null) {
    setMatch(nextMatch);
    setEditAxisTeamId(nextMatch?.axisTeamId || "");
    setEditAlliesTeamId(nextMatch?.alliesTeamId || "");
    setEditMapName(nextMatch?.mapName || "");
    setEditMidpointName(nextMatch?.midpointName || "");
    setEditGameUrl(nextMatch?.gameUrl || "");
  }

  function getSuggestedStreamerIds(overflowCount: number, suggestedSteamIds: string[] = []) {
    return suggestedSteamIds.slice(0, overflowCount);
  }

  async function refreshMatch() {
    const [meRes, res] = await Promise.all([fetch("/api/auth/me"), fetch(`/api/matches/${matchId}`)]);
    const meData = await meRes.json();
    const data = await res.json();
    setRole(meData.session?.role || null);
    setMatchWithEditor(data.match || null);
  }

  useEffect(() => {
    let active = true;
    if (!matchId) return;

    void (async () => {
      const [meRes, res] = await Promise.all([fetch("/api/auth/me"), fetch(`/api/matches/${matchId}`)]);
      const meData = await meRes.json();
      const data = await res.json();
      if (active) {
        setRole(meData.session?.role || null);
        setMatchWithEditor(data.match || null);
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId]);

  async function saveMatchDetails(event: React.FormEvent) {
    event.preventDefault();
    setBusySaveDetails(true);
    setError("");

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          axisTeamId: editAxisTeamId,
          alliesTeamId: editAlliesTeamId,
          mapName: editMapName,
          midpointName: editMidpointName,
          gameUrl: editGameUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save match details.");
        return;
      }

      setMatchWithEditor(data.match || null);
    } finally {
      setBusySaveDetails(false);
    }
  }

  async function uploadStats(event: React.FormEvent) {
    event.preventDefault();
    setError("");
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
    if (!res.ok) {
      setError(data.error || "Failed to upload stats.");
      return;
    }
    setUploadSummary(data);
    await refreshMatch();
  }

  async function importStatsFromLink() {
    setBusyImport(true);
    setError("");
    setStreamerPrompt(null);

    try {
      const res = await fetch(`/api/matches/${matchId}/stats/import-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ excludedSteamIds: [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsStreamerSelection) {
          const suggestedSteamIds = getSuggestedStreamerIds(data.overflowCount, data.suggestedSteamIds || []);
          setStreamerPrompt({
            overflowCount: data.overflowCount,
            totalPlayersFound: data.totalPlayersFound,
            candidates: data.candidates || [],
            suggestedSteamIds,
          });
          setSelectedStreamerIds(suggestedSteamIds);
        }
        setError(data.error || "Failed to import stats from the game link.");
        return;
      }

      setUploadSummary(data);
      await refreshMatch();
    } finally {
      setBusyImport(false);
    }
  }

  async function confirmStreamerSelection() {
    if (!streamerPrompt) return;

    setBusyImport(true);
    setError("");

    try {
      const res = await fetch(`/api/matches/${matchId}/stats/import-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ excludedSteamIds: selectedStreamerIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsStreamerSelection) {
          const suggestedSteamIds = getSuggestedStreamerIds(data.overflowCount, data.suggestedSteamIds || []);
          setStreamerPrompt({
            overflowCount: data.overflowCount,
            totalPlayersFound: data.totalPlayersFound,
            candidates: data.candidates || [],
            suggestedSteamIds,
          });
          setSelectedStreamerIds(suggestedSteamIds);
        }
        setError(data.error || "Failed to import stats from the game link.");
        return;
      }

      setStreamerPrompt(null);
      setSelectedStreamerIds([]);
      setUploadSummary(data);
      await refreshMatch();
    } finally {
      setBusyImport(false);
    }
  }

  function toggleStreamerSelection(steamId: string) {
    setSelectedStreamerIds((current) =>
      current.includes(steamId) ? current.filter((value) => value !== steamId) : [...current, steamId],
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Match week {match?.week}: {match?.teamA.name} vs {match?.teamB.name}
      </h1>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Team 1</p>
          <p className="mt-1 font-medium">{match?.teamA.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Team 2</p>
          <p className="mt-1 font-medium">{match?.teamB.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</p>
          <p className="mt-1 font-medium">{match?.status?.replaceAll("_", " ") || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Played</p>
          <p className="mt-1 font-medium">{match?.playedAt ? new Date(match.playedAt).toLocaleString() : "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Axis</p>
          <p className="mt-1 font-medium">{[match?.teamA, match?.teamB].find((team) => team?.id === match?.axisTeamId)?.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Allies</p>
          <p className="mt-1 font-medium">{[match?.teamA, match?.teamB].find((team) => team?.id === match?.alliesTeamId)?.name || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Map</p>
          <p className="mt-1 font-medium">{match?.mapName || "-"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Midpoint</p>
          <p className="mt-1 font-medium">{match?.midpointName || "-"}</p>
        </div>
        {match?.gameUrl ? (
          <div className="md:col-span-4">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={match.gameUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-slate-700 underline underline-offset-4"
              >
                Open linked game record
              </a>
              {role === "HCA_ORGA" ? (
                <button type="button" className="bg-slate-900 px-4 py-2 text-white" onClick={importStatsFromLink} disabled={busyImport}>
                  {busyImport ? "Importing..." : "Import stats from link"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {role === "HCA_ORGA" && match ? (
        <form onSubmit={saveMatchDetails} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Axis team</span>
            <select value={editAxisTeamId} onChange={(event) => setEditAxisTeamId(event.target.value)} required>
              <option value="">Select Axis</option>
              {[match.teamA, match.teamB].map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Allies team</span>
            <select value={editAlliesTeamId} onChange={(event) => setEditAlliesTeamId(event.target.value)} required>
              <option value="">Select Allies</option>
              {[match.teamA, match.teamB].map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Map</span>
            <select value={editMapName} onChange={(event) => setEditMapName(event.target.value)}>
              <option value="">Unknown</option>
              {HLL_MAPS.map((map) => (
                <option key={map} value={map}>
                  {map}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Midpoint</span>
            <input value={editMidpointName} onChange={(event) => setEditMidpointName(event.target.value)} placeholder="Official strongpoint" />
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Stats link</span>
            <input type="url" value={editGameUrl} onChange={(event) => setEditGameUrl(event.target.value)} placeholder="http://95.216.175.159:7014/games/33023" />
          </label>
          <div className="md:col-span-5">
            <button className="bg-slate-900 px-4 py-2 text-white" disabled={busySaveDetails}>
              {busySaveDetails ? "Saving..." : "Save match details"}
            </button>
          </div>
        </form>
      ) : null}

      {role === "HCA_ORGA" ? (
        <form onSubmit={uploadStats} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Upload match stats CSV</h2>
          <p className="text-xs text-slate-500">Expected headers: team, steam_id, steam_name, kills, deaths, kpd, kpm, dpm, role</p>

          <textarea className="h-40 w-full" value={csvText} onChange={(e) => setCsvText(e.target.value)} />
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="bg-slate-900 px-4 py-2 text-white">Upload stats</button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {streamerPrompt ? (
        <div className="space-y-3 rounded-[24px] border border-amber-400/20 bg-[var(--panel)]/92 p-5 text-sm text-[var(--foreground)] shadow-[var(--shadow)] backdrop-blur-xl">
          <div>
            <h3 className="font-semibold text-amber-200">Choose streamer accounts to exclude</h3>
            <p className="mt-1 text-[var(--muted)]">
              This game has {streamerPrompt.totalPlayersFound} players. Select{" "}
              {streamerPrompt.overflowCount} streamer{streamerPrompt.overflowCount === 1 ? "" : "s"} so we only store the 98 match participants.
            </p>
            {streamerPrompt.suggestedSteamIds.length ? (
              <p className="mt-1 text-xs text-amber-200/80">
                Zero-kill players have been preselected as the likely streamer account{streamerPrompt.suggestedSteamIds.length === 1 ? "" : "s"}.
              </p>
            ) : null}
          </div>

          <div className="max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/10">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/5 text-amber-100/90">
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
                {streamerPrompt.candidates.map((candidate) => (
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
              disabled={busyImport || selectedStreamerIds.length !== streamerPrompt.overflowCount}
              onClick={confirmStreamerSelection}
            >
              {busyImport ? "Importing..." : `Exclude ${streamerPrompt.overflowCount} and import`}
            </button>
            <p className="text-xs text-amber-200/80">
              Selected {selectedStreamerIds.length} of {streamerPrompt.overflowCount}
            </p>
          </div>
        </div>
      ) : null}

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
              <th className="px-4 py-3">Steam name</th>
              <th className="px-4 py-3">SteamID64</th>
              <th className="px-4 py-3">K</th>
              <th className="px-4 py-3">D</th>
              <th className="px-4 py-3">KPD</th>
              <th className="px-4 py-3">KPM</th>
              <th className="px-4 py-3">DPM</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {match?.matchPlayers.map((player) => (
              <tr key={player.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{player.team.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{player.rawSteamId}</td>
                <td className="px-4 py-3">{player.displayName || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs">{player.steamId64 || "-"}</td>
                <td className="px-4 py-3">{player.kills ?? "-"}</td>
                <td className="px-4 py-3">{player.deaths ?? "-"}</td>
                <td className="px-4 py-3">{player.killDeathRatio?.toFixed(2) ?? "-"}</td>
                <td className="px-4 py-3">{player.killsPerMinute?.toFixed(2) ?? "-"}</td>
                <td className="px-4 py-3">{player.deathsPerMinute?.toFixed(2) ?? "-"}</td>
                <td className="px-4 py-3">{player.role || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
