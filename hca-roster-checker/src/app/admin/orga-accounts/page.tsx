"use client";

import { useEffect, useState } from "react";

type OrgaAccount = {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  createdAt: string;
};

export default function OrgaAccountsPage() {
  const [orgaAccounts, setOrgaAccounts] = useState<OrgaAccount[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [rootUsername, setRootUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const res = await fetch("/api/admin/orga-accounts");
    const data = await res.json();

    setOrgaAccounts(data.orgaAccounts || []);
    setCanCreate(Boolean(data.canCreateOrga));
    setRootUsername(data.rootUsername || "");
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      const res = await fetch("/api/admin/orga-accounts");
      const data = await res.json();

      if (!active) return;
      setOrgaAccounts(data.orgaAccounts || []);
      setCanCreate(Boolean(data.canCreateOrga));
      setRootUsername(data.rootUsername || "");
    })();

    return () => {
      active = false;
    };
  }, []);

  async function createOrga(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/admin/orga-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, email }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to create HCA ORGA account.");
        return;
      }

      setUsername("");
      setPassword("");
      setDisplayName("");
      setEmail("");
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">HCA ORGA Accounts</h1>

      {!canCreate ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Signed in as {rootUsername || "non-root orga"}. Only root admin account MILK can create HCA ORGA accounts.
        </p>
      ) : null}

      <form onSubmit={createOrga} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={!canCreate || busy}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={!canCreate || busy}
        />
        <input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={!canCreate || busy}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canCreate || busy}
        />
        {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
        <div className="md:col-span-2">
          <button className="bg-slate-900 px-4 py-2 text-white" disabled={!canCreate || busy}>
            {busy ? "Saving..." : "Create HCA ORGA"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgaAccounts.map((account) => (
              <tr key={account.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{account.username}</td>
                <td className="px-4 py-3">{account.email || "-"}</td>
                <td className="px-4 py-3">{account.displayName || "-"}</td>
                <td className="px-4 py-3">{new Date(account.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
