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
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshTeams() {
    const res = await fetch("/api/teams");
    const data = await res.json();
    setTeams(data.teams || []);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (active) {
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

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>

      <form onSubmit={createTeam} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-4">
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
          <button className="bg-slate-900 px-4 py-2 text-white" disabled={loading}>
            {loading ? "Creating..." : "Create team"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Tag</th>
              <th className="px-4 py-3">Roster entries</th>
              <th className="px-4 py-3">Violations</th>
              <th className="px-4 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{team.name}</td>
                <td className="px-4 py-3">{team.tag || "-"}</td>
                <td className="px-4 py-3">{team._count.rosterEntries}</td>
                <td className="px-4 py-3">{team._count.violations}</td>
                <td className="px-4 py-3">
                  <Link href={`/teams/${team.id}`} className="text-slate-700 underline">
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {teams.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
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
