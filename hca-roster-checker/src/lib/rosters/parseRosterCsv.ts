import Papa from "papaparse";

export type ParsedRosterRow = {
  steamId: string;
  displayName?: string;
  rowNumber: number;
};

export type MalformedRosterRow = {
  rowNumber: number;
  message: string;
  raw: Record<string, unknown>;
};

export type ParsedRosterCsv = {
  rows: ParsedRosterRow[];
  malformedRows: MalformedRosterRow[];
};

type RawRosterCsvRow = {
  steam_id?: string;
  display_name?: string;
  name?: string;
  [key: string]: string | undefined;
};

export function parseRosterCsv(csvText: string): ParsedRosterCsv {
  const parsed = Papa.parse<RawRosterCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const rows: ParsedRosterRow[] = [];
  const malformedRows: MalformedRosterRow[] = [];

  parsed.data.forEach((row, index) => {
    const steamId = row.steam_id?.trim();
    const displayName = row.display_name?.trim() || row.name?.trim();
    const rowNumber = index + 2;

    if (!steamId) {
      malformedRows.push({
        rowNumber,
        message: "Missing required steam_id column value.",
        raw: row,
      });
      return;
    }

    rows.push({
      steamId,
      displayName: displayName || undefined,
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
