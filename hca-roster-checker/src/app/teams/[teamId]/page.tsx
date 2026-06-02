"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Team = {
  id: string;
  name: string;
  tag?: string | null;
};

type RosterEntry = {
  id: string;
  submittedAt: string;
  player: {
    id: string;
    steamId64: string;
    displayName?: string | null;
  };
};

type RosterChange = {
  id: string;
  action: "ROSTER_PLAYER_ADDED" | "ROSTER_PLAYER_REMOVED";
  actor?: string | null;
  steamId64?: string | null;
  displayName?: string | null;
  createdAt: string;
};

type Violation = {
  id: string;
  type: string;
  severity: string;
  status: string;
  rawSteamId?: string | null;
  details: unknown;
  createdAt: string;
};

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [season, setSeason] = useState("2026-S1");
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [hasSubmittedRoster, setHasSubmittedRoster] = useState(false);
  const [changes, setChanges] = useState<RosterChange[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);

  const [csvText, setCsvText] = useState("steam_id,display_name\n");
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [addSteamId, setAddSteamId] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState("");

  async function refreshData() {
    const [meRes, teamRes, rosterRes, validationRes] = await Promise.all([
      fetch(`/api/auth/me`),
      fetch(`/api/teams/${teamId}`),
      fetch(`/api/teams/${teamId}/roster?season=${encodeURIComponent(season)}`),
      fetch(`/api/teams/${teamId}/validation`),
    ]);

    const meData = await meRes.json();
    const teamData = await teamRes.json();
    const rosterData = await rosterRes.json();
    const validationData = await validationRes.json();

    setRole(meData.session?.role || null);
    setTeam(teamData.team || null);
    setRoster(rosterData.roster || []);
    setHasSubmittedRoster(Boolean(rosterData.hasSubmittedRoster));
    setChanges(rosterData.changes || []);
    setViolations(validationData.violations || []);
  }

  useEffect(() => {
    let active = true;
    if (!teamId) return;

    void (async () => {
      const [meRes, teamRes, rosterRes, validationRes] = await Promise.all([
        fetch(`/api/auth/me`),
        fetch(`/api/teams/${teamId}`),
        fetch(`/api/teams/${teamId}/roster?season=${encodeURIComponent(season)}`),
        fetch(`/api/teams/${teamId}/validation`),
      ]);

      const meData = await meRes.json();
      const teamData = await teamRes.json();
      const rosterData = await rosterRes.json();
      const validationData = await validationRes.json();

      if (active) {
        setRole(meData.session?.role || null);
        setTeam(teamData.team || null);
        setRoster(rosterData.roster || []);
        setHasSubmittedRoster(Boolean(rosterData.hasSubmittedRoster));
        setChanges(rosterData.changes || []);
        setViolations(validationData.violations || []);
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId, season]);

  async function uploadRoster(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("csvText", csvText);
    }

    const res = await fetch(`/api/teams/${teamId}/roster/upload?season=${encodeURIComponent(season)}`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Roster submission failed.");
      return;
    }

    setUploadResult(data);
    await refreshData();
  }

  async function addPlayer(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction(true);
    setError("");

    try {
      const res = await fetch(`/api/teams/${teamId}/roster/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamId: addSteamId,
          displayName: addDisplayName,
          season,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add player.");
        return;
      }

      setAddSteamId("");
      setAddDisplayName("");
      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  async function removePlayer(rosterEntryId: string) {
    setBusyAction(true);
    setError("");

    try {
      const res = await fetch(`/api/teams/${teamId}/roster/manage`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterEntryId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to remove player.");
        return;
      }

      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  async function lockRoster() {
    await fetch(`/api/teams/${teamId}/roster/lock?season=${encodeURIComponent(season)}`, {
      method: "POST",
    });
    await refreshData();
  }

  async function unlockRoster() {
    await fetch(`/api/teams/${teamId}/roster/unlock?season=${encodeURIComponent(season)}`, {
      method: "POST",
    });
    await refreshData();
  }

  const canSubmitInitialRoster = role === "HCA_ORGA" || !hasSubmittedRoster;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {team?.name || "Team"} {team?.tag ? `(${team.tag})` : ""}
        </h1>

        <div className="flex items-center gap-2">
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Season" />
          {role === "HCA_ORGA" ? (
            <>
              <button className="bg-slate-900 px-4 py-2 text-white" onClick={lockRoster}>
                Lock roster
              </button>
              <button className="bg-slate-700 px-4 py-2 text-white" onClick={unlockRoster}>
                Unlock roster
              </button>
            </>
          ) : null}
        </div>
      </div>

      {canSubmitInitialRoster ? (
        <form onSubmit={uploadRoster} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Initial roster submission</h2>
          <p className="text-xs text-slate-500">Expected headers: steam_id, display_name (optional)</p>
          <textarea
            className="h-40 w-full"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV here"
          />
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="bg-slate-900 px-4 py-2 text-white">Submit roster</button>
        </form>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Initial roster already submitted. Use the controls below to add or remove players.
        </div>
      )}

      <form onSubmit={addPlayer} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3">
        <input
          value={addSteamId}
          onChange={(e) => setAddSteamId(e.target.value)}
          placeholder="Steam ID64 / SteamID / SteamID3"
          required
          disabled={busyAction}
        />
        <input
          value={addDisplayName}
          onChange={(e) => setAddDisplayName(e.target.value)}
          placeholder="Display name (optional)"
          disabled={busyAction}
        />
        <div>
          <button className="bg-slate-900 px-4 py-2 text-white" disabled={busyAction}>
            {busyAction ? "Working..." : "Add player"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {uploadResult ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-semibold">Upload report</h3>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(uploadResult, null, 2)}</pre>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">SteamID64</th>
              <th className="px-4 py-3">Steam profile</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{entry.player.steamId64}</td>
                <td className="px-4 py-3 text-xs">
                  <a
                    href={`https://steamcommunity.com/profiles/${entry.player.steamId64}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-700 underline"
                  >
                    View profile
                  </a>
                </td>
                <td className="px-4 py-3">{entry.player.displayName || "-"}</td>
                <td className="px-4 py-3">{new Date(entry.submittedAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="bg-slate-700 px-3 py-1 text-xs text-white"
                    onClick={() => removePlayer(entry.id)}
                    disabled={busyAction}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {roster.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No active players on this roster yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Roster activity log</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Steam ID</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {change.action === "ROSTER_PLAYER_ADDED" ? "Added" : "Removed"}
                  </td>
                  <td className="px-4 py-3">{change.displayName || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{change.steamId64 || "-"}</td>
                  <td className="px-4 py-3">{change.actor || "unknown"}</td>
                  <td className="px-4 py-3">{new Date(change.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {changes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No roster add/remove activity yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Steam ID</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((issue) => (
              <tr key={issue.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{issue.type}</td>
                <td className="px-4 py-3">{issue.severity}</td>
                <td className="px-4 py-3">{issue.status}</td>
                <td className="px-4 py-3 font-mono text-xs">{issue.rawSteamId || "-"}</td>
                <td className="px-4 py-3">{new Date(issue.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
