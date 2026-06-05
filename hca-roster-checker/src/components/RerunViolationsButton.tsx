"use client";

import { useState } from "react";

export function RerunViolationsButton() {
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState("");

  async function rerunAllViolations() {
    setBusy(true);
    setResultText("");
    try {
      const res = await fetch("/api/validation/run-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setResultText(data.error || "Failed to rerun validation.");
        return;
      }

      setResultText(`Rerun complete: created ${data.violationsCreated ?? 0}, removed ${data.deletedViolations ?? 0}.`);
    } catch {
      setResultText("Failed to rerun validation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={rerunAllViolations}
        className="rounded-full border border-cyan-400/20 bg-cyan-400/88 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-300 disabled:opacity-60"
        disabled={busy}
        title="Rerun duplicate-roster validation for all teams"
      >
        {busy ? "Rerunning..." : "Rerun Violations"}
      </button>
      {resultText ? <span className="text-xs text-[var(--muted)]">{resultText}</span> : null}
    </div>
  );
}
