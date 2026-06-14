"use client";

import { useEffect, useMemo, useState } from "react";

type Violation = {
  id: string;
  type: "DUPLICATE_ROSTER" | "INVALID_STEAM_ID";
  severity: string;
  status: "OPEN" | "DISMISSED" | "CONFIRMED";
  rawSteamId?: string | null;
  details: unknown;
  team?: { name: string } | null;
  player?: {
    displayName?: string | null;
    rosterEntries?: {
      id: string;
      teamId: string;
      team: { name: string };
    }[];
  } | null;
};

type ResolvedViolation = {
  id: string;
  actor?: string | null;
  createdAt: string;
  violationType?: string | null;
  playerName?: string | null;
  rawSteamId?: string | null;
  teamName?: string | null;
  resolution?: string | null;
  keptTeamName?: string | null;
  removedTeamNames?: unknown[];
};

const typeOptions = ["", "DUPLICATE_ROSTER", "INVALID_STEAM_ID"] as const;

export default function ViolationsPage() {
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [type, setType] = useState<(typeof typeOptions)[number]>("");
  const [violations, setViolations] = useState<Violation[]>([]);
  const [resolvedViolations, setResolvedViolations] = useState<ResolvedViolation[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string>>({});
  const [invalidResolutionModes, setInvalidResolutionModes] = useState<Record<string, "STEAM_ID" | "GAMESPASS" | "">>({});
  const [correctedSteamIds, setCorrectedSteamIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    return params.toString();
  }, [type]);

  async function refreshViolations() {
    const res = await fetch(`/api/violations${query ? `?${query}` : ""}`);
    const data = await res.json();
    setViolations(data.violations || []);
    setResolvedViolations(data.resolvedViolations || []);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const [meRes, res] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/violations${query ? `?${query}` : ""}`),
      ]);
      const meData = await meRes.json();
      const data = await res.json();
      if (active) {
        setRole(meData.session?.role || null);
        setViolations(data.violations || []);
        setResolvedViolations(data.resolvedViolations || []);
      }
    })();

    return () => {
      active = false;
    };
  }, [query]);

  async function resolveViolation(violation: Violation) {
    setError(null);
    setNotice(null);

    const selectedTeamId = selectedTeams[violation.id];
    if (violation.type === "DUPLICATE_ROSTER" && !selectedTeamId) {
      setError("Select the team this player is staying on before resolving the duplicate roster violation.");
      return;
    }

    if (violation.type === "INVALID_STEAM_ID") {
      const resolutionType = invalidResolutionModes[violation.id];
      if (!resolutionType) {
        setError("Choose whether this invalid ID should be corrected to a Steam ID or marked as a Game Pass ID.");
        return;
      }

      if (resolutionType === "STEAM_ID" && !(correctedSteamIds[violation.id] || "").trim()) {
        setError("Enter a valid Steam ID before resolving this violation.");
        return;
      }
    }

    const res = await fetch(`/api/violations/${violation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        violation.type === "DUPLICATE_ROSTER"
          ? { selectedTeamId }
          : {
              resolutionType: invalidResolutionModes[violation.id],
              correctedSteamId: correctedSteamIds[violation.id],
            },
      ),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to resolve violation.");
      return;
    }

    const data = await res.json().catch(() => ({}));
    if ((data.duplicateViolationsCreated ?? 0) > 0) {
      setNotice(`Resolved invalid Steam ID and created ${data.duplicateViolationsCreated} duplicate roster violation${data.duplicateViolationsCreated === 1 ? "" : "s"}.`);
    }

    await refreshViolations();
  }

  const groupedViolations = violations.reduce<Record<string, Violation[]>>((groups, violation) => {
    const teamName = violation.team?.name || "Unassigned";
    if (!groups[teamName]) {
      groups[teamName] = [];
    }
    groups[teamName].push(violation);
    return groups;
  }, {});

  const groupedEntries = Object.entries(groupedViolations).sort(([left], [right]) => left.localeCompare(right));

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Violations</h1>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
        <select value={type} onChange={(event) => setType(event.target.value as (typeof typeOptions)[number])}>
          <option value="">All types</option>
          {typeOptions.filter(Boolean).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>
      ) : null}

      <div className="space-y-4">
        {groupedEntries.map(([teamName, teamViolations]) => (
          <section key={teamName} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-lg font-semibold tracking-tight">{teamName}</h2>
              <p className="text-sm text-slate-500">
                {teamViolations.length} violation{teamViolations.length === 1 ? "" : "s"}
              </p>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Steam ID</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamViolations.map((violation) => (
                  <tr key={violation.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">{violation.type}</td>
                    <td className="px-4 py-3">{violation.player?.displayName || "-"}</td>
                    <td className="px-4 py-3">{violation.severity}</td>
                    <td className="px-4 py-3 font-mono text-xs">{violation.rawSteamId || "-"}</td>
                    <td className="max-w-xs px-4 py-3 text-xs">
                      <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(violation.details, null, 2)}</pre>
                    </td>
                    <td className="space-y-2 px-4 py-3">
                      {role === "HCA_ORGA" ? (
                        <div className="flex flex-col gap-2">
                          {violation.type === "DUPLICATE_ROSTER" ? (
                            <select
                              className="max-w-48 rounded border border-slate-300 px-2 py-1 text-xs"
                              value={selectedTeams[violation.id] || ""}
                              onChange={(event) =>
                                setSelectedTeams((current) => ({
                                  ...current,
                                  [violation.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select team</option>
                              {(violation.player?.rosterEntries || []).map((entry) => (
                                <option key={entry.id} value={entry.teamId}>
                                  {entry.team.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <select
                                className="max-w-48 rounded border border-slate-300 px-2 py-1 text-xs"
                                value={invalidResolutionModes[violation.id] || ""}
                                onChange={(event) =>
                                  setInvalidResolutionModes((current) => ({
                                    ...current,
                                    [violation.id]: event.target.value as "STEAM_ID" | "GAMESPASS" | "",
                                  }))
                                }
                              >
                                <option value="">Select resolution</option>
                                <option value="STEAM_ID">Enter valid Steam ID</option>
                                <option value="GAMESPASS">Game Pass ID</option>
                              </select>
                              {invalidResolutionModes[violation.id] === "STEAM_ID" ? (
                                <input
                                  className="max-w-56 rounded border border-slate-300 px-2 py-1 text-xs"
                                  placeholder="SteamID64 / [U:1:X] / STEAM_X:Y:Z"
                                  value={correctedSteamIds[violation.id] || ""}
                                  onChange={(event) =>
                                    setCorrectedSteamIds((current) => ({
                                      ...current,
                                      [violation.id]: event.target.value,
                                    }))
                                  }
                                />
                              ) : null}
                            </>
                          )}
                          <button className="bg-slate-900 px-2 py-1 text-xs text-white" onClick={() => resolveViolation(violation)}>
                            Resolve
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Read only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {groupedEntries.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No active violations match the current filters.
          </div>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight">Resolved violation log</h2>
          <p className="text-sm text-slate-500">Recent violations marked resolved by HCA ORGA.</p>
        </div>
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Resolution</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {resolvedViolations.map((log) => (
              <tr key={log.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{log.violationType || "-"}</td>
                <td className="px-4 py-3">
                  {log.playerName || log.rawSteamId || "-"}
                  {log.teamName ? <span className="block text-xs text-slate-500">{log.teamName}</span> : null}
                </td>
                <td className="px-4 py-3">
                  {log.resolution || "-"}
                  {log.keptTeamName ? (
                    <span className="block text-xs text-slate-500">
                      Kept {log.keptTeamName}
                      {log.removedTeamNames?.length ? `; removed ${log.removedTeamNames.join(", ")}` : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{log.actor || "-"}</td>
              </tr>
            ))}
            {resolvedViolations.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No resolved violations have been logged yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}
