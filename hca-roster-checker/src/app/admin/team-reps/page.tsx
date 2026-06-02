"use client";

import { useEffect, useState } from "react";

type Team = {
  id: string;
  name: string;
  tag?: string | null;
};

type TeamRep = {
  id: string;
  email: string;
  displayName?: string | null;
  isActive: boolean;
  createdAt: string;
  team?: Team | null;
};

export default function TeamRepsAdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [reps, setReps] = useState<TeamRep[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const [teamsRes, repsRes] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/admin/team-reps"),
    ]);

    const teamsData = await teamsRes.json();
    const repsData = await repsRes.json();

    setTeams(teamsData.teams || []);
    setReps(repsData.reps || []);

    if (!teamId && teamsData.teams?.[0]?.id) {
      setTeamId(teamsData.teams[0].id);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const [teamsRes, repsRes] = await Promise.all([
        fetch("/api/teams"),
        fetch("/api/admin/team-reps"),
      ]);

      const teamsData = await teamsRes.json();
      const repsData = await repsRes.json();

      if (!active) {
        return;
      }

      setTeams(teamsData.teams || []);
      setReps(repsData.reps || []);

      if (teamsData.teams?.[0]?.id) {
        setTeamId((prev) => prev || teamsData.teams[0].id);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function createRep(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/admin/team-reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, teamId }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to create Team Rep.");
        return;
      }

      setEmail("");
      setPassword("");
      setDisplayName("");
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRep(userId: string) {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/team-reps/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to delete Team Rep.");
        return;
      }

      await loadData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Team Rep Accounts</h1>

      <form onSubmit={createRep} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2">
        <input
          type="email"
          placeholder="rep@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
          <option value="">Select team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
        <div className="md:col-span-2">
          <button disabled={busy} className="bg-slate-900 px-4 py-2 text-white">
            {busy ? "Saving..." : "Create Team Rep"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{rep.email}</td>
                <td className="px-4 py-3">{rep.displayName || "-"}</td>
                <td className="px-4 py-3">{rep.team?.name || "-"}</td>
                <td className="px-4 py-3">{new Date(rep.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    disabled={busy}
                    onClick={() => deleteRep(rep.id)}
                    className="bg-slate-700 px-3 py-1 text-xs text-white"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {reps.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No Team Rep accounts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
