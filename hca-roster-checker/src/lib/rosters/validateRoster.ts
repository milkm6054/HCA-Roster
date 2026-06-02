import { AccountAgeRisk, RosterEntryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedRosterRow } from "@/lib/rosters/parseRosterCsv";
import { estimateSteamAccountCreatedAt } from "@/lib/steam/accountAge";
import { normalizeSteamId } from "@/lib/steam/steamIds";
import type { RosterValidationResult, ValidationIssue } from "@/lib/types/validation";

type ValidateRosterInput = {
  teamId: string;
  season: string;
  rows: ParsedRosterRow[];
};

export type NormalizedRosterRow = {
  row: ParsedRosterRow;
  steamId64: string;
  steamId3?: string;
};

export type ValidateRosterOutput = RosterValidationResult & {
  normalizedRows: NormalizedRosterRow[];
};

const riskToSeverity: Record<AccountAgeRisk, ValidationIssue["severity"]> = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
  UNKNOWN: "LOW",
};

export async function validateRoster({
  teamId,
  season,
  rows,
}: ValidateRosterInput): Promise<ValidateRosterOutput> {
  const issues: ValidationIssue[] = [];
  const normalizedRows: NormalizedRosterRow[] = [];
  let invalidRows = 0;

  const rowMapBySteamId64 = new Map<string, number[]>();

  for (const row of rows) {
    const normalized = normalizeSteamId(row.steamId);

    if (!normalized.ok) {
      invalidRows += 1;
      issues.push({
        type: "INVALID_STEAM_ID",
        severity: "HIGH",
        steamIdInput: row.steamId,
        message: normalized.reason,
        rowNumbers: [row.rowNumber],
      });
      continue;
    }

    normalizedRows.push({
      row,
      steamId64: normalized.steamId64,
      steamId3: normalized.steamId3,
    });

    const existingRows = rowMapBySteamId64.get(normalized.steamId64) || [];
    existingRows.push(row.rowNumber);
    rowMapBySteamId64.set(normalized.steamId64, existingRows);
  }

  for (const [steamId64, rowNumbers] of rowMapBySteamId64.entries()) {
    if (rowNumbers.length > 1) {
      issues.push({
        type: "DUPLICATE_IN_UPLOAD",
        severity: "HIGH",
        steamIdInput: steamId64,
        steamId64,
        message: "Steam ID appears multiple times in this uploaded roster.",
        rowNumbers,
      });
    }
  }

  const uniqueSteamIds = [...rowMapBySteamId64.keys()];

  if (uniqueSteamIds.length > 0) {
    const conflicts = await prisma.rosterEntry.findMany({
      where: {
        season,
        status: RosterEntryStatus.ACTIVE,
        teamId: { not: teamId },
        player: {
          steamId64: { in: uniqueSteamIds },
        },
      },
      select: {
        team: { select: { name: true } },
        player: { select: { steamId64: true } },
      },
    });

    const conflictsBySteam = new Map<string, string[]>();
    for (const conflict of conflicts) {
      const known = conflictsBySteam.get(conflict.player.steamId64) || [];
      if (!known.includes(conflict.team.name)) {
        known.push(conflict.team.name);
      }
      conflictsBySteam.set(conflict.player.steamId64, known);
    }

    for (const [steamId64, teamNames] of conflictsBySteam.entries()) {
      const rowNumbers = rowMapBySteamId64.get(steamId64) || [];
      issues.push({
        type: "DUPLICATE_ACROSS_TEAMS",
        severity: "CRITICAL",
        steamIdInput: steamId64,
        steamId64,
        message: "Steam ID already exists on another active team roster for this season.",
        rowNumbers,
        conflictingTeams: teamNames,
      });
    }
  }

  for (const normalized of normalizedRows) {
    const age = estimateSteamAccountCreatedAt(normalized.steamId64);

    if (age.accountAgeRisk === AccountAgeRisk.MEDIUM || age.accountAgeRisk === AccountAgeRisk.HIGH || age.accountAgeRisk === AccountAgeRisk.CRITICAL) {
      issues.push({
        type: "NEW_ACCOUNT",
        severity: riskToSeverity[age.accountAgeRisk],
        steamIdInput: normalized.row.steamId,
        steamId64: normalized.steamId64,
        message: "Account is potentially too new based on placeholder account age check.",
        rowNumbers: [normalized.row.rowNumber],
      });
    }
  }

  return {
    validRows: rows.length - invalidRows,
    invalidRows,
    issues,
    normalizedRows,
  };
}
