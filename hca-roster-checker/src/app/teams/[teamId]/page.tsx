"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Team = {
  id: string;
  name: string;
  tag?: string | null;
  logoDataUrl?: string | null;
  recentMatches?: Array<{
    id: string;
    week: number;
    mapName?: string | null;
    midpointName?: string | null;
    gameUrl?: string | null;
    playedAt?: string | null;
    opponent: string;
    sideLabel: string;
    _count: {
      matchPlayers: number;
      violations: number;
    };
  }>;
};

type RosterEntry = {
  id: string;
  submittedAt: string;
  player: {
    id: string;
    steamId64: string;
    displayName?: string | null;
  };
};

type RosterChange = {
  id: string;
  action: "ROSTER_PLAYER_ADDED" | "ROSTER_PLAYER_REMOVED";
  actor?: string | null;
  steamId64?: string | null;
  displayName?: string | null;
  createdAt: string;
};

type Violation = {
  id: string;
  type: "DUPLICATE_ROSTER" | "INVALID_STEAM_ID";
  severity: string;
  status: string;
  rawSteamId?: string | null;
  details: unknown;
  createdAt: string;
  player?: {
    displayName?: string | null;
    rosterEntries?: Array<{
      id: string;
      teamId: string;
      team: {
        name: string;
      };
    }>;
  } | null;
  match?: {
    week: number;
    mapName?: string | null;
    teamA: { name: string };
    teamB: { name: string };
  } | null;
};

type GamespassMember = {
  id: string;
  displayName?: string | null;
  rowNumber?: number | null;
};

type RosterSortKey = "steamId64" | "displayName" | "submittedAt";
type RosterSortDirection = "asc" | "desc";

const SAMPLE_ROSTER_CSV = [
  "name,steam_id",
  "SampleCaptain,76561198000000001",
].join("\n");

function getInitials(label: string): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || "N/A";
}

function getConflictingTeams(details: unknown): string[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const detailRecord = details as Record<string, unknown>;
  const directTeams = Array.isArray(detailRecord.conflictingTeamNames)
    ? detailRecord.conflictingTeamNames
    : [];
  const issueRecord =
    detailRecord.issue && typeof detailRecord.issue === "object" && !Array.isArray(detailRecord.issue)
      ? (detailRecord.issue as Record<string, unknown>)
      : null;
  const nestedTeams = Array.isArray(issueRecord?.conflictingTeams) ? issueRecord.conflictingTeams : [];

  return [...directTeams, ...nestedTeams]
    .filter((team): team is string => typeof team === "string" && team.trim().length > 0)
    .filter((team, index, list) => list.findIndex((candidate) => candidate === team) === index);
}

function getViolationDisplayName(violation: Violation): string {
  if (violation.player?.displayName) {
    return violation.player.displayName;
  }

  if (!violation.details || typeof violation.details !== "object" || Array.isArray(violation.details)) {
    return "-";
  }

  const details = violation.details as Record<string, unknown>;
  return typeof details.displayName === "string" ? details.displayName : "-";
}

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [season, setSeason] = useState("2026-S1");
  const [role, setRole] = useState<"HCA_ORGA" | "TEAM_REP" | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [hasSubmittedRoster, setHasSubmittedRoster] = useState(false);
  const [changes, setChanges] = useState<RosterChange[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [gamespassMembers, setGamespassMembers] = useState<GamespassMember[]>([]);

  const [csvText, setCsvText] = useState("name,steam_id\n");
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, unknown> | null>(null);
  const [addSteamId, setAddSteamId] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [busyLogoAction, setBusyLogoAction] = useState(false);
  const [error, setError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [rosterSortKey, setRosterSortKey] = useState<RosterSortKey>("submittedAt");
  const [rosterSortDirection, setRosterSortDirection] = useState<RosterSortDirection>("desc");
  const [warningSelectedTeams, setWarningSelectedTeams] = useState<Record<string, string>>({});
  const [warningResolutionModes, setWarningResolutionModes] = useState<Record<string, "STEAM_ID" | "GAMESPASS" | "REMOVE_INVALID_ENTRY" | "">>({});
  const [warningCorrectedSteamIds, setWarningCorrectedSteamIds] = useState<Record<string, string>>({});
  const [selectedInvalidWarnings, setSelectedInvalidWarnings] = useState<Record<string, boolean>>({});

  async function refreshData() {
    const [meRes, teamRes, rosterRes, validationRes] = await Promise.all([
      fetch(`/api/auth/me`),
      fetch(`/api/teams/${teamId}`),
      fetch(`/api/teams/${teamId}/roster?season=${encodeURIComponent(season)}`),
      fetch(`/api/teams/${teamId}/validation`),
    ]);

    const meData = await meRes.json();
    const teamData = await teamRes.json();
    const rosterData = await rosterRes.json();
    const validationData = await validationRes.json();

    setRole(meData.session?.role || null);
    setTeam(teamData.team || null);
    setRoster(rosterData.roster || []);
    setHasSubmittedRoster(Boolean(rosterData.hasSubmittedRoster));
    setChanges(rosterData.changes || []);
    setGamespassMembers(rosterData.gamespassMembers || []);
    setViolations(validationData.violations || []);
  }

  useEffect(() => {
    let active = true;
    if (!teamId) return;

    void (async () => {
      const [meRes, teamRes, rosterRes, validationRes] = await Promise.all([
        fetch(`/api/auth/me`),
        fetch(`/api/teams/${teamId}`),
        fetch(`/api/teams/${teamId}/roster?season=${encodeURIComponent(season)}`),
        fetch(`/api/teams/${teamId}/validation`),
      ]);

      const meData = await meRes.json();
      const teamData = await teamRes.json();
      const rosterData = await rosterRes.json();
      const validationData = await validationRes.json();

      if (active) {
        setRole(meData.session?.role || null);
        setTeam(teamData.team || null);
        setRoster(rosterData.roster || []);
        setHasSubmittedRoster(Boolean(rosterData.hasSubmittedRoster));
        setChanges(rosterData.changes || []);
        setGamespassMembers(rosterData.gamespassMembers || []);
        setViolations(validationData.violations || []);
      }
    })();

    return () => {
      active = false;
    };
  }, [teamId, season]);

  async function uploadRoster(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    } else {
      formData.append("csvText", csvText);
    }

    const res = await fetch(`/api/teams/${teamId}/roster/upload?season=${encodeURIComponent(season)}`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Roster submission failed.");
      return;
    }

    setUploadResult(data);
    await refreshData();
  }

  async function addPlayer(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction(true);
    setError("");

    try {
      const res = await fetch(`/api/teams/${teamId}/roster/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamId: addSteamId,
          displayName: addDisplayName,
          season,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add player.");
        return;
      }

      setAddSteamId("");
      setAddDisplayName("");
      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  async function removePlayer(rosterEntryId: string) {
    setBusyAction(true);
    setError("");

    try {
      const res = await fetch(`/api/teams/${teamId}/roster/manage`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterEntryId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to remove player.");
        return;
      }

      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  async function lockRoster() {
    await fetch(`/api/teams/${teamId}/roster/lock?season=${encodeURIComponent(season)}`, {
      method: "POST",
    });
    await refreshData();
  }

  async function unlockRoster() {
    await fetch(`/api/teams/${teamId}/roster/unlock?season=${encodeURIComponent(season)}`, {
      method: "POST",
    });
    await refreshData();
  }

  async function resolveWarning(violation: Violation) {
    setBusyAction(true);
    setError("");

    try {
      if (violation.type === "DUPLICATE_ROSTER") {
        const selectedTeamId = warningSelectedTeams[violation.id];
        if (!selectedTeamId) {
          setError("Select which team the player should stay on before resolving this conflict.");
          return;
        }

        const res = await fetch(`/api/violations/${violation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedTeamId }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to resolve duplicate roster violation.");
          return;
        }
      } else {
        const resolutionType = warningResolutionModes[violation.id];
        if (!resolutionType) {
          setError("Choose whether this invalid ID should be corrected or marked as Game Pass.");
          return;
        }

        if (resolutionType === "STEAM_ID" && !(warningCorrectedSteamIds[violation.id] || "").trim()) {
          setError("Enter a corrected Steam ID before resolving this warning.");
          return;
        }

        const res = await fetch(`/api/violations/${violation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutionType,
            correctedSteamId: warningCorrectedSteamIds[violation.id],
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to resolve invalid Steam ID violation.");
          return;
        }
      }

      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  async function updateTeamLogo(nextLogoDataUrl: string | null) {
    setBusyLogoAction(true);
    setError("");

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoDataUrl: nextLogoDataUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update team logo.");
        return;
      }

      setTeam(data.team || null);
    } finally {
      setBusyLogoAction(false);
    }
  }

  async function uploadLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please choose an image file for the team logo.");
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = async () => {
      const result = typeof fileReader.result === "string" ? fileReader.result : null;
      if (!result) {
        setError("Failed to read the selected logo file.");
        return;
      }

      await updateTeamLogo(result);
    };
    fileReader.onerror = () => {
      setError("Failed to read the selected logo file.");
    };
    fileReader.readAsDataURL(selectedFile);
  }

  function toggleRosterSort(nextKey: RosterSortKey) {
    if (rosterSortKey === nextKey) {
      setRosterSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setRosterSortKey(nextKey);
    setRosterSortDirection(nextKey === "submittedAt" ? "desc" : "asc");
  }

  const canSubmitInitialRoster = role === "HCA_ORGA" || !hasSubmittedRoster;
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const sampleRosterCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_ROSTER_CSV)}`;
  const duplicateWarnings = violations.filter((violation) => violation.type === "DUPLICATE_ROSTER");
  const invalidWarnings = violations.filter((violation) => violation.type === "INVALID_STEAM_ID");
  const selectedInvalidWarningIds = invalidWarnings
    .filter((violation) => selectedInvalidWarnings[violation.id])
    .map((violation) => violation.id);
  const filteredRoster = roster.filter((entry) => {
    if (!normalizedMemberSearch) {
      return true;
    }

    return (
      entry.player.steamId64.toLowerCase().includes(normalizedMemberSearch) ||
      (entry.player.displayName || "").toLowerCase().includes(normalizedMemberSearch)
    );
  });
  const sortedRoster = [...filteredRoster].sort((left, right) => {
    let comparison = 0;

    if (rosterSortKey === "steamId64") {
      comparison = left.player.steamId64.localeCompare(right.player.steamId64);
    } else if (rosterSortKey === "displayName") {
      comparison = (left.player.displayName || "").localeCompare(right.player.displayName || "");
    } else {
      comparison = new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime();
    }

    return rosterSortDirection === "asc" ? comparison : comparison * -1;
  });

  async function bulkResolveInvalidWarnings(action: "GAMESPASS" | "REMOVE_INVALID_ENTRY") {
    if (selectedInvalidWarningIds.length === 0) {
      setError("Select at least one invalid Steam ID warning first.");
      return;
    }

    setBusyAction(true);
    setError("");

    try {
      for (const violationId of selectedInvalidWarningIds) {
        const res = await fetch(`/api/violations/${violationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutionType: action,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to resolve one or more invalid Steam ID warnings.");
          return;
        }
      }

      setSelectedInvalidWarnings({});
      await refreshData();
    } finally {
      setBusyAction(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {team?.name || "Team"} {team?.tag ? `(${team.tag})` : ""}
        </h1>

        <div className="flex items-center gap-2">
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Season" />
          {role === "HCA_ORGA" ? (
            <>
              <button className="bg-slate-900 px-4 py-2 text-white" onClick={lockRoster}>
                Lock roster
              </button>
              <button className="bg-slate-700 px-4 py-2 text-white" onClick={unlockRoster}>
                Unlock roster
              </button>
            </>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-500">
            {team?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logoDataUrl} alt={`${team.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <span>{getInitials(team?.tag || team?.name || "N/A")}</span>
            )}
          </div>

          <div className="min-w-[220px] flex-1 space-y-2">
            <div>
              <h2 className="text-lg font-semibold">Team logo</h2>
              <p className="text-sm text-slate-500">
                Upload a logo for your team. Teams without one show the default N/A mark.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm text-white">
                <span>{busyLogoAction ? "Uploading..." : "Upload logo"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} disabled={busyLogoAction} />
              </label>
              <button
                type="button"
                className="bg-slate-700 px-4 py-2 text-white"
                onClick={() => updateTeamLogo(null)}
                disabled={busyLogoAction || !team?.logoDataUrl}
              >
                Clear logo
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-amber-950">Active roster warnings</h2>
            <p className="text-sm text-amber-900">
              {violations.length > 0
                ? `${violations.length} active violation${violations.length === 1 ? "" : "s"} need attention for this team.`
                : "No active violations for this team."}
            </p>
          </div>
        </div>

        {violations.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-amber-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-amber-950">Invalid Steam ID fixes</h3>
                  <p className="text-sm text-amber-900">Resolve or remove bad IDs directly from this team view.</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
                  {invalidWarnings.length}
                </span>
              </div>

              {role === "HCA_ORGA" && invalidWarnings.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="bg-slate-900 px-3 py-1 text-xs text-white"
                    onClick={() => bulkResolveInvalidWarnings("GAMESPASS")}
                    disabled={busyAction || selectedInvalidWarningIds.length === 0}
                  >
                    Mark selected as Game Pass
                  </button>
                  <button
                    type="button"
                    className="bg-slate-700 px-3 py-1 text-xs text-white"
                    onClick={() => bulkResolveInvalidWarnings("REMOVE_INVALID_ENTRY")}
                    disabled={busyAction || selectedInvalidWarningIds.length === 0}
                  >
                    Remove selected invalid rows
                  </button>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {invalidWarnings.map((issue) => (
                  <div key={issue.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium text-amber-950">{getViolationDisplayName(issue)}</p>
                        <p className="font-mono text-xs text-amber-900">{issue.rawSteamId || "-"}</p>
                      </div>
                      {role === "HCA_ORGA" ? (
                        <label className="flex items-center gap-2 text-xs text-amber-950">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedInvalidWarnings[issue.id])}
                            onChange={(event) =>
                              setSelectedInvalidWarnings((current) => ({
                                ...current,
                                [issue.id]: event.target.checked,
                              }))
                            }
                          />
                          Select
                        </label>
                      ) : null}
                    </div>

                    {role === "HCA_ORGA" ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <select
                          className="rounded border border-amber-200 px-2 py-1 text-xs"
                          value={warningResolutionModes[issue.id] || ""}
                          onChange={(event) =>
                            setWarningResolutionModes((current) => ({
                              ...current,
                              [issue.id]: event.target.value as "STEAM_ID" | "GAMESPASS" | "REMOVE_INVALID_ENTRY" | "",
                            }))
                          }
                        >
                          <option value="">Select resolution</option>
                          <option value="STEAM_ID">Enter valid Steam ID</option>
                          <option value="GAMESPASS">Game Pass ID</option>
                          <option value="REMOVE_INVALID_ENTRY">Remove invalid entry</option>
                        </select>
                        {warningResolutionModes[issue.id] === "STEAM_ID" ? (
                          <input
                            className="rounded border border-amber-200 px-2 py-1 text-xs"
                            placeholder="SteamID64 / [U:1:X] / STEAM_X:Y:Z"
                            value={warningCorrectedSteamIds[issue.id] || ""}
                            onChange={(event) =>
                              setWarningCorrectedSteamIds((current) => ({
                                ...current,
                                [issue.id]: event.target.value,
                              }))
                            }
                          />
                        ) : null}
                        <button
                          type="button"
                          className="w-fit bg-slate-900 px-3 py-1 text-xs text-white"
                          onClick={() => resolveWarning(issue)}
                          disabled={busyAction}
                        >
                          {busyAction ? "Working..." : "Resolve"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {invalidWarnings.length === 0 ? (
                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-4 text-sm text-amber-900">
                    No invalid Steam ID warnings for this team.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-lg border border-amber-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-amber-950">Duplicate roster fixes</h3>
                  <p className="text-sm text-amber-900">Choose which team each conflicting player should stay on.</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
                  {duplicateWarnings.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {duplicateWarnings.map((issue) => (
                  <div key={issue.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
                    <div className="space-y-1">
                      <p className="font-medium text-amber-950">{getViolationDisplayName(issue)}</p>
                      <p className="text-sm text-amber-900">
                        Conflicting with: {getConflictingTeams(issue.details).join(", ") || "Unknown"}
                      </p>
                      <p className="font-mono text-xs text-amber-900">{issue.rawSteamId || "-"}</p>
                    </div>

                    {role === "HCA_ORGA" ? (
                      <div className="mt-3 flex flex-col gap-2">
                        <select
                          className="rounded border border-amber-200 px-2 py-1 text-xs"
                          value={warningSelectedTeams[issue.id] || ""}
                          onChange={(event) =>
                            setWarningSelectedTeams((current) => ({
                              ...current,
                              [issue.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select team</option>
                          {(issue.player?.rosterEntries || [])
                            .filter((entry, index, list) => list.findIndex((candidate) => candidate.teamId === entry.teamId) === index)
                            .map((entry) => (
                              <option key={entry.id} value={entry.teamId}>
                                {entry.team.name}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="w-fit bg-slate-900 px-3 py-1 text-xs text-white"
                          onClick={() => resolveWarning(issue)}
                          disabled={busyAction}
                        >
                          {busyAction ? "Working..." : "Resolve"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {duplicateWarnings.length === 0 ? (
                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-4 text-sm text-amber-900">
                    No duplicate roster conflicts for this team.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {violations.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-amber-100/70">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Conflicting teams</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Steam ID</th>
                  <th className="px-4 py-3">Created</th>
                  {role === "HCA_ORGA" ? <th className="px-4 py-3">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {violations.map((issue) => {
                  const conflictingTeams = getConflictingTeams(issue.details);

                  return (
                    <tr key={issue.id} className="border-t border-amber-100">
                      <td className="px-4 py-3 font-medium text-amber-950">{issue.type}</td>
                      <td className="px-4 py-3">{getViolationDisplayName(issue)}</td>
                      <td className="px-4 py-3">
                        {conflictingTeams.length > 0 ? conflictingTeams.join(", ") : "-"}
                      </td>
                      <td className="px-4 py-3">{issue.severity}</td>
                      <td className="px-4 py-3">{issue.status}</td>
                      <td className="px-4 py-3">
                        {issue.match
                          ? `Week ${issue.match.week}: ${issue.match.teamA.name} vs ${issue.match.teamB.name}${issue.match.mapName ? ` (${issue.match.mapName})` : ""}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{issue.rawSteamId || "-"}</td>
                      <td className="px-4 py-3">{new Date(issue.createdAt).toLocaleString()}</td>
                      {role === "HCA_ORGA" ? (
                        <td className="px-4 py-3">
                          <div className="flex min-w-[220px] flex-col gap-2">
                            {issue.type === "DUPLICATE_ROSTER" ? (
                              <>
                                <select
                                  className="rounded border border-amber-200 px-2 py-1 text-xs"
                                  value={warningSelectedTeams[issue.id] || ""}
                                  onChange={(event) =>
                                    setWarningSelectedTeams((current) => ({
                                      ...current,
                                      [issue.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select team</option>
                                  {(issue.player?.rosterEntries || [])
                                    .filter((entry, index, list) => list.findIndex((candidate) => candidate.teamId === entry.teamId) === index)
                                    .map((entry) => (
                                      <option key={entry.id} value={entry.teamId}>
                                        {entry.team.name}
                                      </option>
                                    ))}
                                </select>
                              </>
                            ) : (
                              <>
                                <select
                                  className="rounded border border-amber-200 px-2 py-1 text-xs"
                                  value={warningResolutionModes[issue.id] || ""}
                                  onChange={(event) =>
                                    setWarningResolutionModes((current) => ({
                                      ...current,
                                      [issue.id]: event.target.value as "STEAM_ID" | "GAMESPASS" | "",
                                    }))
                                  }
                                >
                                  <option value="">Select resolution</option>
                                  <option value="STEAM_ID">Enter valid Steam ID</option>
                                  <option value="GAMESPASS">Game Pass ID</option>
                                  <option value="REMOVE_INVALID_ENTRY">Remove invalid entry</option>
                                </select>
                                {warningResolutionModes[issue.id] === "STEAM_ID" ? (
                                  <input
                                    className="rounded border border-amber-200 px-2 py-1 text-xs"
                                    placeholder="SteamID64 / [U:1:X] / STEAM_X:Y:Z"
                                    value={warningCorrectedSteamIds[issue.id] || ""}
                                    onChange={(event) =>
                                      setWarningCorrectedSteamIds((current) => ({
                                        ...current,
                                        [issue.id]: event.target.value,
                                      }))
                                    }
                                  />
                                ) : null}
                              </>
                            )}
                            <button
                              type="button"
                              className="bg-slate-900 px-3 py-1 text-xs text-white"
                              onClick={() => resolveWarning(issue)}
                              disabled={busyAction}
                            >
                              {busyAction ? "Working..." : "Resolve"}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {canSubmitInitialRoster ? (
        <form onSubmit={uploadRoster} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Initial roster submission</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Accepted headers: steam_id, display_name or name, steam_id</p>
            <a
              href={sampleRosterCsvHref}
              download="roster-template-example.csv"
              className="text-xs text-slate-700 underline underline-offset-4"
            >
              Download example CSV
            </a>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <pre className="overflow-x-auto whitespace-pre-wrap">{SAMPLE_ROSTER_CSV}</pre>
          </div>
          <textarea
            className="h-40 w-full"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV here"
          />
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="bg-slate-900 px-4 py-2 text-white">Submit roster</button>
        </form>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Initial roster already submitted. Use the controls below to add or remove players.
        </div>
      )}

      <form onSubmit={addPlayer} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-3">
        <input
          value={addSteamId}
          onChange={(e) => setAddSteamId(e.target.value)}
          placeholder="Steam ID64 / SteamID / SteamID3"
          required
          disabled={busyAction}
        />
        <input
          value={addDisplayName}
          onChange={(e) => setAddDisplayName(e.target.value)}
          placeholder="Display name (optional)"
          disabled={busyAction}
        />
        <div>
          <button className="bg-slate-900 px-4 py-2 text-white" disabled={busyAction}>
            {busyAction ? "Working..." : "Add player"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {uploadResult ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-semibold">Upload report</h3>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(uploadResult, null, 2)}</pre>
        </div>
      ) : null}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Members</h2>
          <input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search by Steam ID or name"
            className="w-full sm:w-72"
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">
                <button type="button" className="border-0 px-0 py-0 font-inherit text-inherit" onClick={() => toggleRosterSort("steamId64")}>
                  SteamID64 {rosterSortKey === "steamId64" ? (rosterSortDirection === "asc" ? "^" : "v") : ""}
                </button>
              </th>
              <th className="px-4 py-3">Steam profile</th>
              <th className="px-4 py-3">
                <button type="button" className="border-0 px-0 py-0 font-inherit text-inherit" onClick={() => toggleRosterSort("displayName")}>
                  Name {rosterSortKey === "displayName" ? (rosterSortDirection === "asc" ? "^" : "v") : ""}
                </button>
              </th>
              <th className="px-4 py-3">
                <button type="button" className="border-0 px-0 py-0 font-inherit text-inherit" onClick={() => toggleRosterSort("submittedAt")}>
                  Submitted {rosterSortKey === "submittedAt" ? (rosterSortDirection === "asc" ? "^" : "v") : ""}
                </button>
              </th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRoster.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{entry.player.steamId64}</td>
                <td className="px-4 py-3 text-xs">
                  <a
                    href={`https://steamcommunity.com/profiles/${entry.player.steamId64}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-700 underline"
                  >
                    View profile
                  </a>
                </td>
                <td className="px-4 py-3">{entry.player.displayName || "-"}</td>
                <td className="px-4 py-3">{new Date(entry.submittedAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="bg-slate-700 px-3 py-1 text-xs text-white"
                    onClick={() => removePlayer(entry.id)}
                    disabled={busyAction}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {sortedRoster.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  {roster.length === 0 ? "No active players on this roster yet." : "No players match that search."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Roster activity log</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Steam ID</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {change.action === "ROSTER_PLAYER_ADDED" ? "Added" : "Removed"}
                  </td>
                  <td className="px-4 py-3">{change.displayName || "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{change.steamId64 || "-"}</td>
                  <td className="px-4 py-3">{change.actor || "unknown"}</td>
                  <td className="px-4 py-3">{new Date(change.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {changes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No roster add/remove activity yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Gamespass members</h2>
        <p className="text-xs text-slate-500">
          IDs detected as gamespass are excluded from Steam violation checks and listed here for reference.
        </p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Display name</th>
                <th className="px-4 py-3">CSV row</th>
              </tr>
            </thead>
            <tbody>
              {gamespassMembers.map((member) => (
                <tr key={`${member.id}-${member.rowNumber ?? "na"}`} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{member.id}</td>
                  <td className="px-4 py-3">{member.displayName || "-"}</td>
                  <td className="px-4 py-3">{member.rowNumber ?? "-"}</td>
                </tr>
              ))}
              {gamespassMembers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No gamespass members detected for this season yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Previous games</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Opponent</th>
                <th className="px-4 py-3">Map</th>
                <th className="px-4 py-3">Midpoint</th>
                <th className="px-4 py-3">Players logged</th>
                <th className="px-4 py-3">Violations</th>
                <th className="px-4 py-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {(team?.recentMatches || []).map((match) => (
                <tr key={match.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{match.week}</td>
                  <td className="px-4 py-3">{match.sideLabel}</td>
                  <td className="px-4 py-3">{match.opponent}</td>
                  <td className="px-4 py-3">{match.mapName || "-"}</td>
                  <td className="px-4 py-3">{match.midpointName || "-"}</td>
                  <td className="px-4 py-3">{match._count.matchPlayers}</td>
                  <td className="px-4 py-3">{match._count.violations}</td>
                  <td className="px-4 py-3">
                    <a href={`/matches/${match.id}`} className="text-slate-700 underline underline-offset-4">
                      View
                    </a>
                  </td>
                </tr>
              ))}
              {(team?.recentMatches || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No previous games linked to this team yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
