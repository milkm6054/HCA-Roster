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
      className="rounded-full border border-white/15 bg-white/6 px-3 py-1.5 text-xs text-[var(--foreground)] backdrop-blur transition hover:border-white/25 hover:bg-white/10"
      onClick={logout}
      disabled={busy}
    >
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}
