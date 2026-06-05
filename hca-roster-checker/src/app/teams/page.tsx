"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Team = {
  id: string;
  name: string;
  tag?: string | null;
  _count: {
    rosterEntries: number;
    violations: number;
  };
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refreshTeams() {
    const res = await fetch("/api/teams");
    const data = await res.json();
    setTeams(data.teams || []);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const [meRes, res] = await Promise.all([fetch("/api/auth/me"), fetch("/api/teams")]);
      const meData = await meRes.json();
      const data = await res.json();
      if (active) {
        setRole(meData.session?.role || null);
        setTeams(data.teams || []);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag }),
      });

      setName("");
      setTag("");
      await refreshTeams();
    } finally {
      setLoading(false);
    }
  }

  async function deleteTeam(team: Team) {
    const confirmed = window.confirm(`Delete team \"${team.name}\"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setBusyTeamId(team.id);
    setError("");
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete team.");
        return;
      }

      await refreshTeams();
    } finally {
      setBusyTeamId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="surface-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-500">Registry</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Teams</h1>
      </div>

      {role === "HCA_ORGA" ? (
        <form onSubmit={createTeam} className="surface-card grid gap-3 p-4 md:grid-cols-4">
          <input
            placeholder="Team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Tag (optional)"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <div className="md:col-span-2">
            <button className="primary-button px-4 py-2" disabled={loading}>
              {loading ? "Creating..." : "Create team"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="surface-table">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3">Roster entries</th>
              <th className="px-4 py-3">Violations</th>
              <th className="px-4 py-3">Open</th>
              {role === "HCA_ORGA" ? <th className="px-4 py-3">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td className="px-4 py-3 font-medium">{team.name}</td>
                <td className="px-4 py-3">{team.tag || "-"}</td>
                <td className="px-4 py-3">{team._count.rosterEntries}</td>
                <td className="px-4 py-3">{team._count.violations}</td>
                <td className="px-4 py-3">
                  <Link href={`/teams/${team.id}`} className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-4">
                    Manage
                  </Link>
                </td>
                {role === "HCA_ORGA" ? (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="danger-button px-3 py-1 text-xs disabled:opacity-60"
                      onClick={() => deleteTeam(team)}
                      disabled={busyTeamId === team.id}
                    >
                      {busyTeamId === team.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
            {teams.length === 0 ? (
              <tr>
                <td colSpan={role === "HCA_ORGA" ? 6 : 5} className="px-4 py-6 text-center muted-copy">
                  No teams yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
