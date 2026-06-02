import Papa from "papaparse";

export type ParsedMatchStatsRow = {
  team: string;
  steamId: string;
  kills?: number;
  deaths?: number;
  role?: string;
  rowNumber: number;
};

export type ParsedMatchStatsCsv = {
  rows: ParsedMatchStatsRow[];
  malformedRows: Array<{
    rowNumber: number;
    message: string;
    raw: Record<string, unknown>;
  }>;
};

type RawMatchStatsRow = {
  team?: string;
  steam_id?: string;
  kills?: string;
  deaths?: string;
  role?: string;
  [key: string]: string | undefined;
};

export function parseMatchStatsCsv(csvText: string): ParsedMatchStatsCsv {
  const parsed = Papa.parse<RawMatchStatsRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows: ParsedMatchStatsRow[] = [];
  const malformedRows: ParsedMatchStatsCsv["malformedRows"] = [];

  parsed.data.forEach((row, index) => {
    const team = row.team?.trim();
    const steamId = row.steam_id?.trim();
    const rowNumber = index + 2;

    if (!team || !steamId) {
      malformedRows.push({
        rowNumber,
        message: "Missing required team or steam_id value.",
        raw: row,
      });
      return;
    }

    rows.push({
      team,
      steamId,
      kills: row.kills ? Number(row.kills) : undefined,
      deaths: row.deaths ? Number(row.deaths) : undefined,
      role: row.role?.trim() || undefined,
      rowNumber,
    });
  });

  parsed.errors.forEach((error) => {
    malformedRows.push({
      rowNumber: Number(error.row) + 2,
      message: error.message,
      raw: {},
    });
  });

  return { rows, malformedRows };
}
