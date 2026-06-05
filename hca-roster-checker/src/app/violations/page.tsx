"use client";

import { useEffect, useMemo, useState } from "react";

type Violation = {
  id: string;
  type: string;
  severity: string;
  status: "OPEN" | "DISMISSED" | "CONFIRMED";
  rawSteamId?: string | null;
  details: unknown;
  team?: { name: string } | null;
  player?: { displayName?: string | null } | null;
};

const statusOptions = ["", "OPEN", "DISMISSED", "CONFIRMED"] as const;
const typeOptions = [
  "",
  "DUPLICATE_ROSTER",
  "INVALID_STEAM_ID",
  "UNREGISTERED_PLAYER",
] as const;

export default function ViolationsPage() {
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [type, setType] = useState<(typeof typeOptions)[number]>("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("");
  const [violations, setViolations] = useState<Violation[]>([]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    return params.toString();
  }, [type, status]);

  async function refreshViolations() {
    const res = await fetch(`/api/violations${query ? `?${query}` : ""}`);
    const data = await res.json();
    setViolations(data.violations || []);
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
      }
    })();

    return () => {
      active = false;
    };
  }, [query]);

  async function setViolationStatus(violationId: string, nextStatus: "DISMISSED" | "CONFIRMED") {
    await fetch(`/api/violations/${violationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

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
        <select value={type} onChange={(e) => setType(e.target.value as (typeof typeOptions)[number])}>
          <option value="">All types</option>
          {typeOptions.filter(Boolean).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof statusOptions)[number])}
        >
          <option value="">All statuses</option>
          {statusOptions.filter(Boolean).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

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
                  <th className="px-4 py-3">Status</th>
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
                    <td className="px-4 py-3">{violation.status}</td>
                    <td className="space-x-2 px-4 py-3">
                      {role === "HCA_ORGA" ? (
                        <>
                          <button
                            className="bg-slate-700 px-2 py-1 text-xs text-white"
                            onClick={() => setViolationStatus(violation.id, "DISMISSED")}
                            disabled={violation.status === "DISMISSED"}
                          >
                            Dismiss
                          </button>
                          <button
                            className="bg-slate-900 px-2 py-1 text-xs text-white"
                            onClick={() => setViolationStatus(violation.id, "CONFIRMED")}
                            disabled={violation.status === "CONFIRMED"}
                          >
                            Confirm
                          </button>
                        </>
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
            No violations match the current filters.
          </div>
        ) : null}
      </div>
    </section>
  );
}
