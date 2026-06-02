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
  lockedAt?: string | null;
  player: {
    steamId64: string;
    displayName?: string | null;
    accountAgeRisk: string;
  };
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
  const [violations, setViolations] = useState<Violation[]>([]);

  const [csvText, setCsvText] = useState("steam_id,display_name\n");
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);

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
        setViolations(validationData.violations || []);
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId, season]);

  async function uploadRoster(event: React.FormEvent) {
    event.preventDefault();

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
    setUploadResult(data);
    await refreshData();
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

  const isLocked = roster.some((entry) => Boolean(entry.lockedAt));

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

      <p className="text-sm text-slate-600">Roster status: {isLocked ? "LOCKED" : "UNLOCKED"}</p>

      <form onSubmit={uploadRoster} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Upload roster CSV</h2>
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Account risk</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Locked</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{entry.player.steamId64}</td>
                <td className="px-4 py-3">{entry.player.displayName || "-"}</td>
                <td className="px-4 py-3">{entry.player.accountAgeRisk}</td>
                <td className="px-4 py-3">{new Date(entry.submittedAt).toLocaleString()}</td>
                <td className="px-4 py-3">{entry.lockedAt ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
