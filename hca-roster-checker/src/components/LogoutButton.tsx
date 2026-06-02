"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.push("/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="border border-slate-300 bg-white px-3 py-1 text-xs"
      onClick={logout}
      disabled={busy}
    >
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}
