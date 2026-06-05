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
        className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700 disabled:opacity-60"
        disabled={busy}
        title="Rerun duplicate-roster validation for all teams"
      >
        {busy ? "Rerunning..." : "Rerun Violations"}
      </button>
      {resultText ? <span className="text-xs text-slate-500">{resultText}</span> : null}
    </div>
  );
}
